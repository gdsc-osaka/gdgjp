import type { AvailabilityRecord, AvailabilityValue } from "./types";

/**
 * D1 access for `availabilities` (docs/roster/index.md §4). Same wholesale
 * delete-all-then-insert shape as `./skills.server` — the apply form always
 * submits the full grid (every event time slot needs an entry, per
 * `./validate.ts`), so there is never a partial update to reconcile.
 */

type AvailabilityRow = {
  application_id: string;
  time_slot_id: string;
  value: string;
};

const AVAILABILITY_COLS = "application_id, time_slot_id, value";

export function toAvailability(r: AvailabilityRow): AvailabilityRecord {
  return {
    applicationId: r.application_id,
    timeSlotId: r.time_slot_id,
    value: r.value as AvailabilityValue,
  };
}

export async function listAvailabilityForApplication(
  db: D1Database,
  applicationId: string,
): Promise<AvailabilityRecord[]> {
  const { results } = await db
    .prepare(`SELECT ${AVAILABILITY_COLS} FROM availabilities WHERE application_id = ?`)
    .bind(applicationId)
    .all<AvailabilityRow>();
  return (results ?? []).map(toAvailability);
}

export type AvailabilityInput = { timeSlotId: string; value: AvailabilityValue };

/** Replaces the application's whole availability grid — never a partial merge. */
export async function setAvailability(
  db: D1Database,
  applicationId: string,
  entries: readonly AvailabilityInput[],
): Promise<void> {
  const statements: D1PreparedStatement[] = [
    db.prepare("DELETE FROM availabilities WHERE application_id = ?").bind(applicationId),
  ];
  for (const entry of entries) {
    statements.push(
      db
        .prepare(
          "INSERT INTO availabilities (application_id, time_slot_id, value) VALUES (?, ?, ?)",
        )
        .bind(applicationId, entry.timeSlotId, entry.value),
    );
  }
  await db.batch(statements);
}
