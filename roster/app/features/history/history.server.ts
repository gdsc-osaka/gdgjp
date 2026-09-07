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
 * "Design" §3). Also truncates any "future" (redo) revisions past the
 * current cursor before inserting a new one (§2: rewinding then editing
 * discards the branch, it does not fork), and evicts the oldest revision(s)
 * once the 50-entry cap is exceeded (§4), all inside one `db.batch` so the
 * insert, truncation, and eviction are atomic together.
 */
export async function recordRevision(db: D1Database, input: RecordRevisionInput): Promise<void> {
  const cursor = await getEventCursor(db, input.eventId);
  const head = cursor === null ? null : await getRevisionBySeq(db, input.eventId, cursor);
  const now = new Date();
  const groupKey = input.groupKey ?? null;
  const snapshot = serializeSnapshot(input.assignments);
  const metricsJson = JSON.stringify(input.metrics);

  if (
    head &&
    shouldMergeIntoHead(
      { kind: head.kind as RevisionKind, groupKey: head.group_key, createdAt: head.created_at },
      { kind: input.kind, groupKey },
      now,
    )
  ) {
    await db
      .prepare(
        "UPDATE revisions SET label = ?, snapshot = ?, metrics = ?, created_at = ? WHERE event_id = ? AND seq = ?",
      )
      .bind(input.label, snapshot, metricsJson, now.toISOString(), input.eventId, head.seq)
      .run();
    return;
  }

  const newSeq = (cursor ?? 0) + 1;
  const statements: D1PreparedStatement[] = [];

  // Rewound-then-edited: discard the redo branch before inserting the new
  // head (docs/roster/08-history.md "Design" §2 — no multi-branch history).
  if (cursor !== null) {
    statements.push(
      db
        .prepare("DELETE FROM revisions WHERE event_id = ? AND seq > ?")
        .bind(input.eventId, cursor),
    );
  }

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
 */
export async function restoreRevision(
  db: D1Database,
  eventId: string,
  seq: number,
  // Accepted per the stage doc's signature; unused today because a restore
  // writes no row anywhere that would record who performed it — kept for the
  // `kind: 'restore'` branch-recording use the stage doc reserves (Design §5).
  _actor: Actor,
): Promise<RestoreResult> {
  const row = await getRevisionBySeq(db, eventId, seq);
  if (!row) throw new Error(`No revision at event ${eventId}, seq ${seq}`);

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
