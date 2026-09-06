import type { Demand } from "./types";
import { validateDemand } from "./validate";

/**
 * D1 access for the `demands` table (docs/roster/index.md §4;
 * docs/roster/03-demand-input.md "Design" §1). Follows the same `*Row` ->
 * `to*()` -> column-list-constant -> `RETURNING`/`ON CONFLICT` pattern as
 * `~/features/events/events.server` and `~/features/schedule/schedule.server`.
 *
 * The one behavior specific to this table: `ideal === 0` must read and
 * write identically to the row not existing at all (types.ts module doc).
 * Every read filters `ideal_count > 0`; every write deletes instead of
 * storing a zero-ideal row.
 */

type DemandRow = {
  event_id: string;
  time_slot_id: string;
  track_id: string;
  role_id: string;
  min_count: number;
  ideal_count: number;
  lead_min: number;
  new_max: number;
};

const DEMAND_COLS =
  "event_id, time_slot_id, track_id, role_id, min_count, ideal_count, lead_min, new_max";

export function toDemand(r: DemandRow): Demand {
  return {
    timeSlotId: r.time_slot_id,
    trackId: r.track_id,
    roleId: r.role_id,
    min: r.min_count,
    ideal: r.ideal_count,
    leadMin: r.lead_min,
    newMax: r.new_max,
  };
}

/**
 * Collapses `ideal_count <= 0` to the same `null` a missing row would
 * produce — belt-and-suspenders alongside `listDemandsForEvent`'s own
 * `ideal_count > 0` filter, since the write path (`bulkUpsertDemands`)
 * deletes rather than stores such a row, but a defensive read should not
 * depend on that alone.
 */
export function demandOrNull(row: DemandRow | null): Demand | null {
  if (!row || row.ideal_count <= 0) return null;
  return toDemand(row);
}

/** An event's full demand set (`ideal_count > 0` only — see module doc). Used by the matrix UI and, from Stage 06, the solver. */
export async function listDemandsForEvent(db: D1Database, eventId: string): Promise<Demand[]> {
  const { results } = await db
    .prepare(`SELECT ${DEMAND_COLS} FROM demands WHERE event_id = ? AND ideal_count > 0`)
    .bind(eventId)
    .all<DemandRow>();
  return (results ?? []).map(toDemand);
}

export async function getDemand(
  db: D1Database,
  timeSlotId: string,
  trackId: string,
  roleId: string,
): Promise<Demand | null> {
  const row = await db
    .prepare(
      `SELECT ${DEMAND_COLS} FROM demands WHERE time_slot_id = ? AND track_id = ? AND role_id = ?`,
    )
    .bind(timeSlotId, trackId, roleId)
    .first<DemandRow>();
  return demandOrNull(row);
}

export class DemandValidationFailure extends Error {
  constructor(public readonly errors: readonly string[]) {
    super(`Invalid demand value: ${errors.join(", ")}`);
    this.name = "DemandValidationFailure";
  }
}

function demandStatement(db: D1Database, eventId: string, input: Demand): D1PreparedStatement {
  if (input.ideal === 0) {
    // "no demand" — delete rather than store a zero-ideal row, so a
    // subsequent read never has to special-case this write path (module
    // doc). ON DELETE CASCADE elsewhere in the schema never touches this
    // table's own rows, so a plain DELETE is enough.
    return db
      .prepare("DELETE FROM demands WHERE time_slot_id = ? AND track_id = ? AND role_id = ?")
      .bind(input.timeSlotId, input.trackId, input.roleId);
  }
  return db
    .prepare(
      `INSERT INTO demands (${DEMAND_COLS})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (time_slot_id, track_id, role_id) DO UPDATE SET
         event_id = excluded.event_id,
         min_count = excluded.min_count,
         ideal_count = excluded.ideal_count,
         lead_min = excluded.lead_min,
         new_max = excluded.new_max`,
    )
    .bind(
      eventId,
      input.timeSlotId,
      input.trackId,
      input.roleId,
      input.min,
      input.ideal,
      input.leadMin,
      input.newMax,
    );
}

/**
 * Writes (or, for `ideal === 0`, deletes) every entry atomically via
 * `db.batch` — used for a single-cell edit (one entry), a phase-wide edit
 * (one entry per time slot in the phase, all sharing the same value), and
 * a copy-to-other-targets edit (entries spanning multiple tracks/slots).
 *
 * Every entry is validated (`validate.ts`) before anything is written —
 * defense in depth on top of the route action's own validation, so a
 * `leadMin > ideal` value can never reach D1 through any call site
 * (docs/roster/03-demand-input.md "回帰として固定すべきテスト"). One
 * invalid entry aborts the whole call; nothing is partially written.
 */
export async function bulkUpsertDemands(
  db: D1Database,
  eventId: string,
  inputs: readonly Demand[],
): Promise<void> {
  const errorCodes = new Set(inputs.flatMap((input) => validateDemand(input)));
  if (errorCodes.size > 0) throw new DemandValidationFailure([...errorCodes]);
  if (inputs.length === 0) return;
  await db.batch(inputs.map((input) => demandStatement(db, eventId, input)));
}

export async function upsertDemand(db: D1Database, eventId: string, input: Demand): Promise<void> {
  await bulkUpsertDemands(db, eventId, [input]);
}
