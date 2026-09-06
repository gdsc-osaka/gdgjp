import { describe, expect, it } from "vitest";
import { demandLossOnSlotChange } from "./impact";
import type { Demand } from "./types";

function demand(timeSlotId: string, overrides: Partial<Demand> = {}): Demand {
  return {
    timeSlotId,
    trackId: "trk_1",
    roleId: "reception",
    min: 1,
    ideal: 2,
    leadMin: 0,
    newMax: 99,
    ...overrides,
  };
}

describe("demandLossOnSlotChange", () => {
  it("reports no loss when every existing slot key survives the rebuild", () => {
    const existing = [{ id: "slot_1", start: "09:00", end: "10:00" }];
    const next = [{ start: "09:00", end: "10:00" }];
    const result = demandLossOnSlotChange(existing, next, [demand("slot_1")]);
    expect(result).toEqual({ lostCount: 0, lostSlotIds: [] });
  });

  /**
   * docs/roster/03-demand-input.md "回帰として固定すべきテスト": lostCount
   * must match the number of demand rows that actually disappear — an
   * undercount here would let an owner confirm a step-size change and
   * silently lose demand data they were told was safe.
   */
  it("counts every demand row hanging off a slot whose key disappears", () => {
    const existing = [
      { id: "slot_1", start: "09:00", end: "10:00" },
      { id: "slot_2", start: "10:00", end: "11:00" },
    ];
    // Changing step size from 60 to 30 min regenerates the grid with a
    // different set of (start, end) keys entirely.
    const next = [
      { start: "09:00", end: "09:30" },
      { start: "09:30", end: "10:00" },
      { start: "10:00", end: "10:30" },
      { start: "10:30", end: "11:00" },
    ];
    const demands = [
      demand("slot_1", { trackId: "trk_1", roleId: "reception" }),
      demand("slot_1", { trackId: "trk_1", roleId: "guide" }),
      demand("slot_2", { trackId: "trk_2", roleId: "stream" }),
    ];
    const result = demandLossOnSlotChange(existing, next, demands);
    expect(result.lostCount).toBe(3);
    expect(result.lostSlotIds.sort()).toEqual(["slot_1", "slot_2"]);
  });

  it("does not count a kept slot's demand even when other slots are lost", () => {
    const existing = [
      { id: "slot_1", start: "09:00", end: "10:00" },
      { id: "slot_2", start: "10:00", end: "11:00" },
    ];
    const next = [{ start: "09:00", end: "10:00" }];
    const demands = [demand("slot_1"), demand("slot_2")];
    const result = demandLossOnSlotChange(existing, next, demands);
    expect(result).toEqual({ lostCount: 1, lostSlotIds: ["slot_2"] });
  });

  it("ignores an ideal=0 row on a removed slot — it's equivalent to no row, so nothing is lost", () => {
    const existing = [{ id: "slot_1", start: "09:00", end: "10:00" }];
    const next: { start: string; end: string }[] = [];
    const demands = [demand("slot_1", { ideal: 0, min: 0, leadMin: 0, newMax: 0 })];
    const result = demandLossOnSlotChange(existing, next, demands);
    expect(result).toEqual({ lostCount: 0, lostSlotIds: [] });
  });

  it("deduplicates lostSlotIds when one slot loses multiple demand rows", () => {
    const existing = [{ id: "slot_1", start: "09:00", end: "10:00" }];
    const next: { start: string; end: string }[] = [];
    const demands = [
      demand("slot_1", { roleId: "reception" }),
      demand("slot_1", { roleId: "guide" }),
    ];
    const result = demandLossOnSlotChange(existing, next, demands);
    expect(result.lostCount).toBe(2);
    expect(result.lostSlotIds).toEqual(["slot_1"]);
  });
});
