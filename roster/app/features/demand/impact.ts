import { reconcileSlotKeys } from "~/features/schedule/reconcile";
import type { Demand } from "./types";

/**
 * How many demand rows would be lost if the event's time-slot grid were
 * regenerated for a new `(start, end, stepMin)` range (docs/roster/index.md
 * §4 "前提として確認済みの事実"; docs/roster/03-demand-input.md "Design"
 * §6). Stage 02's `regenerateTimeSlots` keeps a slot's `id` only when its
 * `(start_time, end_time)` key survives the rebuild — a demand row hanging
 * off a slot whose key changed is deleted by the `ON DELETE CASCADE` on
 * `demands.time_slot_id`.
 *
 * Reuses `reconcileSlotKeys` (Stage 02) rather than re-deriving the
 * keep/remove diff — see the stage doc's "再実装しない" note.
 */
export type ExistingSlotKey = { id: string; start: string; end: string };
export type NextSlotKey = { start: string; end: string };

export type DemandLossImpact = {
  /** Number of demand rows (cells) that would be deleted. */
  lostCount: number;
  /** Distinct time-slot ids losing at least one demand row. */
  lostSlotIds: string[];
};

export function demandLossOnSlotChange(
  existingSlots: readonly ExistingSlotKey[],
  nextSlots: readonly NextSlotKey[],
  demands: readonly Demand[],
): DemandLossImpact {
  const { remove } = reconcileSlotKeys(existingSlots, nextSlots);
  const removedSlotIds = new Set(remove);

  // "ideal === 0" is equivalent to "no row" (types.ts module doc) — such a
  // row (if one somehow exists) carries no real demand, so its removal
  // isn't a loss to warn about.
  const lostDemands = demands.filter((d) => d.ideal > 0 && removedSlotIds.has(d.timeSlotId));

  return {
    lostCount: lostDemands.length,
    lostSlotIds: [...new Set(lostDemands.map((d) => d.timeSlotId))],
  };
}
