import { listApplicationsForEvent } from "~/features/applications/applications.server";
import { writeAssignments } from "~/features/roster/roster.server";
import { listTimeSlots } from "~/features/schedule/schedule.server";
import { type Assignments, type Metrics, parseAssignmentKey } from "~/features/solver/types";
import { shouldMergeIntoHead } from "./grouping";
import { RETENTION_LIMIT, selectEvictions } from "./retention";
import { parseSnapshot, serializeSnapshot } from "./snapshot";
import type { Actor, HistoryState, RestoreResult, RevisionKind, RevisionSummary } from "./types";

/**
 * D1 access for `revisions` + `events.revision_cursor` (docs/roster/index.md
 * §4, docs/roster/08-history.md "Design" §3-5, ADR-006). This is the module
 * `roster.server.ts#writeAssignments` calls into on every write — see that
 * file's doc comment for the hook itself.
 *
 * **Intentional two-way import with `~/features/roster/roster.server`**: this
 * file imports `writeAssignments` (for `restoreRevision`'s D1 write — the
 * stage doc is explicit that restore must reuse the ONE write path, never a
 * bespoke `INSERT`/`DELETE` against `assignments`), and `roster.server.ts`
 * imports `recordRevision` from here (for the hook on every write). Both
 * directions only ever call the other's function from inside an async
 * function body, at request time — never from top-level module code — and
 * both exports are `function` declarations (hoisted), so the cycle carries
 * no init-order hazard under ESM. This mirrors the one-directional pattern
 * `app/features/supply/` uses elsewhere in this app, except here the
 * relationship is genuinely bidirectional by design: "the single write path
 * always records history" and "restore reuses the single write path" cannot
 * both hold without it.
 */

type RevisionRow = {
  id: string;
  event_id: string;
  seq: number;
  label: string;
  actor: string;
  actor_id: string | null;
  kind: string;
  group_key: string | null;
  snapshot: string;
  metrics: string;
  created_at: string;
};

async function getEventCursor(db: D1Database, eventId: string): Promise<number | null> {
  const row = await db
    .prepare("SELECT revision_cursor FROM events WHERE id = ?")
    .bind(eventId)
    .first<{ revision_cursor: number | null }>();
  return row?.revision_cursor ?? null;
}

async function getRevisionBySeq(
  db: D1Database,
  eventId: string,
  seq: number,
): Promise<RevisionRow | null> {
  return db
    .prepare(
      `SELECT id, event_id, seq, label, actor, actor_id, kind, group_key, snapshot, metrics, created_at
       FROM revisions WHERE event_id = ? AND seq = ?`,
    )
    .bind(eventId, seq)
    .first<RevisionRow>();
}

/** What `roster.server.ts#writeAssignments` passes in on every call that
 * should be recorded. `kind` deliberately excludes `"restore"` at the type
 * level — restoring never reaches this function at all (docs/roster/
 * 08-history.md "Design" §5: "復元そのものは新しい履歴を作らない"), so there is no
 * call site that could legally pass it. */
export type RecordRevisionInput = {
  eventId: string;
  assignments: Assignments;
  metrics: Metrics;
  label: string;
  actor: Actor;
  kind: "generate" | "edit";
  groupKey?: string | null;
};

/**
 * Inserts a new revision, OR — when the merge conditions in `grouping.ts`
 * hold — overwrites the current head row in place (docs/roster/08-history.md
 * "Design" §3). Truncates any "future" (redo) revisions past the current
 * cursor BEFORE either of those (§2: rewinding then editing discards the
 * branch, it does not fork) — this runs on both paths, since the cursor can
 * be rewound onto a revision that is itself a mergeable `edit` head, and
 * evicts the oldest revision(s) once the 50-entry cap is exceeded (§4, insert
 * path only — nothing is added on a merge, so there is nothing new to evict).
 * Every path is one `db.batch` call, so truncation/update-or-insert/eviction
 * land atomically together.
 */
export async function recordRevision(db: D1Database, input: RecordRevisionInput): Promise<void> {
  const cursor = await getEventCursor(db, input.eventId);
  const head = cursor === null ? null : await getRevisionBySeq(db, input.eventId, cursor);
  const now = new Date();
  const groupKey = input.groupKey ?? null;
  const snapshot = serializeSnapshot(input.assignments);
  const metricsJson = JSON.stringify(input.metrics);

  // Rewound-then-edited: discard any redo branch before doing anything else
  // (docs/roster/08-history.md "Design" §2 — no multi-branch history). This
  // must run on BOTH paths below, not just the insert-a-new-row path: if the
  // cursor was rewound to a revision that happens to be a mergeable `edit`
  // head, merging into it must still truncate the redo branch — otherwise
  // stale "future" rows stay reachable via redo after the head's content has
  // changed underneath them (a real bug caught in review: this delete used
  // to run only on the insert path, so restore -> merge-eligible edit left
  // the old redo branch alive).
  const statements: D1PreparedStatement[] = [];
  if (cursor !== null) {
    statements.push(
      db
        .prepare("DELETE FROM revisions WHERE event_id = ? AND seq > ?")
        .bind(input.eventId, cursor),
    );
  }

  if (
    head &&
    shouldMergeIntoHead(
      { kind: head.kind as RevisionKind, groupKey: head.group_key, createdAt: head.created_at },
      { kind: input.kind, groupKey },
      now,
    )
  ) {
    statements.push(
      db
        .prepare(
          "UPDATE revisions SET label = ?, snapshot = ?, metrics = ?, created_at = ? WHERE event_id = ? AND seq = ?",
        )
        .bind(input.label, snapshot, metricsJson, now.toISOString(), input.eventId, head.seq),
    );
    await db.batch(statements);
    return;
  }

  const newSeq = (cursor ?? 0) + 1;

  statements.push(
    db
      .prepare(
        `INSERT INTO revisions
           (id, event_id, seq, label, actor, actor_id, kind, group_key, snapshot, metrics, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        input.eventId,
        newSeq,
        input.label,
        input.actor.name,
        input.actor.id,
        input.kind,
        groupKey,
        snapshot,
        metricsJson,
        now.toISOString(),
      ),
  );
  statements.push(
    db.prepare("UPDATE events SET revision_cursor = ? WHERE id = ?").bind(newSeq, input.eventId),
  );

  // Retention (§4): seqs that will still exist once the truncation above
  // runs (<= cursor) plus the row being inserted now (newSeq) — the
  // truncated ones are already gone from this count, not double-subtracted.
  const remaining = await db
    .prepare("SELECT seq FROM revisions WHERE event_id = ? AND seq <= ?")
    .bind(input.eventId, cursor ?? 0)
    .all<{ seq: number }>();
  const remainingSeqs = [...(remaining.results ?? []).map((r) => r.seq), newSeq];
  for (const seq of selectEvictions(remainingSeqs, newSeq, RETENTION_LIMIT)) {
    statements.push(
      db.prepare("DELETE FROM revisions WHERE event_id = ? AND seq = ?").bind(input.eventId, seq),
    );
  }

  await db.batch(statements);
}

/**
 * Restores `assignments` to revision `seq`'s snapshot and moves the cursor
 * there — never inserts a revision (docs/roster/08-history.md "Design" §5).
 * Filters out any snapshot entry whose `application_id` is gone or withdrawn,
 * or whose `time_slot_id` no longer exists for this event (a withdrawal or a
 * schedule regeneration since the snapshot was taken — docs/roster/
 * 08-history.md "Design" §5), reporting the dropped count instead of
 * throwing or letting a foreign-key violation reach the caller.
 *
 * Returns `null` — rather than throwing — when `seq` itself doesn't name a
 * revision for this event, so `tryRestoreRevision` (below) can distinguish
 * "this specific, expected condition" from any other unrelated failure
 * (a D1 error, a corrupt snapshot, ...) without a broad `catch` that would
 * risk mislabeling those as "not found" too.
 */
export async function restoreRevision(
  db: D1Database,
  eventId: string,
  seq: number,
  // Accepted per the stage doc's signature; unused today because a restore
  // writes no row anywhere that would record who performed it — kept for the
  // `kind: 'restore'` branch-recording use the stage doc reserves (Design §5).
  _actor: Actor,
): Promise<RestoreResult | null> {
  const row = await getRevisionBySeq(db, eventId, seq);
  if (!row) return null;

  const snapshotAssignments = parseSnapshot(row.snapshot);

  const [applications, timeSlots] = await Promise.all([
    listApplicationsForEvent(db, eventId),
    listTimeSlots(db, eventId),
  ]);
  const validApplicationIds = new Set(applications.filter((a) => !a.withdrawn).map((a) => a.id));
  const validSlotIds = new Set(timeSlots.map((s) => s.id));

  let droppedCount = 0;
  const filtered: Assignments = new Map();
  for (const [key, value] of snapshotAssignments) {
    const { applicationId, slotId } = parseAssignmentKey(key);
    if (!validApplicationIds.has(applicationId) || !validSlotIds.has(slotId)) {
      droppedCount++;
      continue;
    }
    filtered.set(key, value);
  }

  // No revision context passed: this write must NOT record a new revision.
  await writeAssignments(db, eventId, filtered);
  await db.prepare("UPDATE events SET revision_cursor = ? WHERE id = ?").bind(seq, eventId).run();

  return { droppedCount };
}

export type RestoreOutcome = { found: true; droppedCount: number } | { found: false };

/**
 * `restoreRevision`, but for a `seq` that came from a request rather than
 * from this module's own lookup (the route's `restore` intent): the `seq` in
 * a submitted form can go stale between page load and click — e.g. another
 * owner's edit evicted it via the 50-entry retention cap in the meantime —
 * which is a real, reachable input error, not a 500-worthy bug. Checks
 * `restoreRevision`'s `null` return for exactly that condition rather than a
 * broad `catch`, so an unrelated failure (a D1 error, a corrupt snapshot)
 * still propagates as a real error instead of being mislabeled "not found."
 * `undoRevision`/`redoRevision` don't need this wrapper: they look up an
 * adjacent `seq` themselves immediately before calling `restoreRevision`, so
 * it can't be stale by the time they use it.
 */
export async function tryRestoreRevision(
  db: D1Database,
  eventId: string,
  seq: number,
  actor: Actor,
): Promise<RestoreOutcome> {
  const result = await restoreRevision(db, eventId, seq, actor);
  if (!result) return { found: false };
  return { found: true, droppedCount: result.droppedCount };
}

/** Moves the cursor one step toward `seq 1` and restores that snapshot, or
 * returns `null` (no-op) when already at the oldest revision or there is no
 * history yet — the route's "← 元に戻す" action. */
export async function undoRevision(
  db: D1Database,
  eventId: string,
  actor: Actor,
): Promise<RestoreResult | null> {
  const cursor = await getEventCursor(db, eventId);
  if (cursor === null) return null;
  const prev = await db
    .prepare("SELECT seq FROM revisions WHERE event_id = ? AND seq < ? ORDER BY seq DESC LIMIT 1")
    .bind(eventId, cursor)
    .first<{ seq: number }>();
  if (!prev) return null;
  return restoreRevision(db, eventId, prev.seq, actor);
}

/** The redo counterpart of `undoRevision` — the route's "やり直す →" action. */
export async function redoRevision(
  db: D1Database,
  eventId: string,
  actor: Actor,
): Promise<RestoreResult | null> {
  const cursor = await getEventCursor(db, eventId);
  if (cursor === null) return null;
  const next = await db
    .prepare("SELECT seq FROM revisions WHERE event_id = ? AND seq > ? ORDER BY seq ASC LIMIT 1")
    .bind(eventId, cursor)
    .first<{ seq: number }>();
  if (!next) return null;
  return restoreRevision(db, eventId, next.seq, actor);
}

/** The history panel's + undo/redo buttons' entire data need (docs/roster/
 * 08-history.md "Design" §6): newest-seq-first, each row carrying its own
 * `evaluate()` metrics so revisions can be compared without re-running
 * anything. Deliberately excludes `snapshot` (never needed by the UI). */
export async function getHistoryState(db: D1Database, eventId: string): Promise<HistoryState> {
  const cursor = await getEventCursor(db, eventId);
  const { results } = await db
    .prepare(
      `SELECT seq, label, actor, actor_id, kind, group_key, metrics, created_at
       FROM revisions WHERE event_id = ? ORDER BY seq DESC`,
    )
    .bind(eventId)
    .all<Omit<RevisionRow, "id" | "event_id" | "snapshot">>();

  const revisions: RevisionSummary[] = (results ?? []).map((r) => ({
    seq: r.seq,
    label: r.label,
    actor: r.actor,
    actorId: r.actor_id,
    kind: r.kind as RevisionKind,
    groupKey: r.group_key,
    metrics: JSON.parse(r.metrics) as Metrics,
    createdAt: r.created_at,
  }));

  return { cursor, revisions };
}
