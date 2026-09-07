import {
  type AssignmentValue,
  type Assignments,
  assignmentKey,
  parseAssignmentKey,
} from "~/features/solver/types";
import type { AssignmentRecord } from "./types";

/**
 * D1 access for `assignments` (docs/roster/index.md §4,
 * docs/roster/07-roster-manual-edit.md "Design" §1, §6). Follows the repo's
 * `*Row` -> `to*()` -> column-list -> convention, but the write side is
 * intentionally NOT the usual single-row `INSERT ... RETURNING`: both
 * auto-generation and manual editing produce a full replacement
 * `Assignments` map (solve()'s output, or the current map with one cell
 * changed — see `e.$id.roster.tsx`'s action), so `writeAssignments` always
 * deletes the event's whole current set and re-inserts it via `db.batch`
 * (docs/roster/07-roster-manual-edit.md Design §2 step 4: "assignments を
 * 全削除して入れ直す（db.batch で原子的に）").
 *
 * **`writeAssignments` is the ONLY function anywhere in this app that
 * writes to `assignments`.** The generate action and every manual-edit
 * intent in `e.$id.roster.tsx` all funnel through it — this is deliberate
 * so Stage 08 can instrument exactly one call site to add history
 * (docs/roster/07-roster-manual-edit.md "Design" §6). Do not add a second
 * write path (e.g. a route calling `db.prepare("INSERT INTO assignments...")`
 * directly) no matter how small the change looks.
 */

type AssignmentRow = {
  event_id: string;
  application_id: string;
  time_slot_id: string;
  track_id: string;
  role_id: string;
  locked: number;
};

const ASSIGNMENT_COLS = "event_id, application_id, time_slot_id, track_id, role_id, locked";

export function toAssignment(r: AssignmentRow): AssignmentRecord {
  return {
    eventId: r.event_id,
    applicationId: r.application_id,
    timeSlotId: r.time_slot_id,
    trackId: r.track_id,
    roleId: r.role_id,
    locked: r.locked === 1,
  };
}

/**
 * An event's current shift table, one row per (application, slot)
 * (docs/roster/index.md §4). Ordered by time slot then application so a
 * caller building a display grid never has to re-sort — not a determinism
 * requirement itself (generation's determinism lives entirely in
 * `solver-input.server.ts`'s assembly and `solve()`'s own guarantee), just a
 * convenience for the grid components that read this.
 */
export async function readAssignments(
  db: D1Database,
  eventId: string,
): Promise<AssignmentRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT ${ASSIGNMENT_COLS} FROM assignments WHERE event_id = ? ORDER BY time_slot_id, application_id`,
    )
    .bind(eventId)
    .all<AssignmentRow>();
  return (results ?? []).map(toAssignment);
}

/** `readAssignments`, reshaped into the solver's own `Assignments` Map —
 * what `evaluate()` / `hardViolations()` / `suggestFor()` all take. */
export async function readAssignmentsMap(db: D1Database, eventId: string): Promise<Assignments> {
  const rows = await readAssignments(db, eventId);
  const map: Assignments = new Map();
  for (const row of rows) {
    map.set(assignmentKey(row.applicationId, row.timeSlotId), {
      trackId: row.trackId,
      roleId: row.roleId,
      locked: row.locked,
    });
  }
  return map;
}

function assignmentStatement(
  db: D1Database,
  eventId: string,
  applicationId: string,
  timeSlotId: string,
  value: AssignmentValue,
): D1PreparedStatement {
  return db
    .prepare(`INSERT INTO assignments (${ASSIGNMENT_COLS}) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(eventId, applicationId, timeSlotId, value.trackId, value.roleId, value.locked ? 1 : 0);
}

/**
 * Replaces an event's ENTIRE `assignments` set with `next` — the single
 * write path every caller uses (module doc). Always a full delete-then-
 * insert, never a partial patch: this is what guarantees a stale row from a
 * previous generation can never survive alongside a new one
 * (docs/roster/07-roster-manual-edit.md "回帰として固定すべきテスト": "生成後に
 * assignments の古い行が残っていない").
 */
export async function writeAssignments(
  db: D1Database,
  eventId: string,
  next: Assignments,
): Promise<void> {
  const statements: D1PreparedStatement[] = [
    db.prepare("DELETE FROM assignments WHERE event_id = ?").bind(eventId),
  ];
  for (const [key, value] of next) {
    const { applicationId, slotId } = parseAssignmentKey(key);
    statements.push(assignmentStatement(db, eventId, applicationId, slotId, value));
  }
  await db.batch(statements);
}
