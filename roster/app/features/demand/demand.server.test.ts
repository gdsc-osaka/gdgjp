import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DemandValidationFailure,
  bulkUpsertDemands,
  demandOrNull,
  toDemand,
} from "./demand.server";

const ROW = {
  event_id: "evt_1",
  time_slot_id: "slot_1",
  track_id: "trk_1",
  role_id: "reception",
  min_count: 3,
  ideal_count: 4,
  lead_min: 1,
  new_max: 2,
};

describe("toDemand", () => {
  it("maps snake_case columns to the solver-spec field names", () => {
    expect(toDemand(ROW)).toEqual({
      timeSlotId: "slot_1",
      trackId: "trk_1",
      roleId: "reception",
      min: 3,
      ideal: 4,
      leadMin: 1,
      newMax: 2,
    });
  });
});

/**
 * docs/roster/03-demand-input.md "回帰として固定すべきテスト": `ideal = 0`
 * の行と行なしが同じ結果を返す — a missing row and a row that (somehow)
 * still has `ideal_count = 0` must be indistinguishable to every caller.
 */
describe("demandOrNull", () => {
  it("returns null for a missing row", () => {
    expect(demandOrNull(null)).toBeNull();
  });

  it("returns null for a row with ideal_count = 0, the same as a missing row", () => {
    const zeroRow = { ...ROW, min_count: 0, ideal_count: 0, lead_min: 0, new_max: 0 };
    expect(demandOrNull(zeroRow)).toBe(demandOrNull(null));
    expect(demandOrNull(zeroRow)).toBeNull();
  });

  it("returns the mapped Demand for a row with ideal_count > 0", () => {
    expect(demandOrNull(ROW)).toEqual(toDemand(ROW));
  });
});

describe("bulkUpsertDemands", () => {
  it("rejects the whole batch when any entry violates leadMin <= ideal, writing nothing", async () => {
    const batchCalls: unknown[][] = [];
    const fakeDb = {
      batch: async (statements: unknown[]) => {
        batchCalls.push(statements);
        return [];
      },
      prepare: () => {
        throw new Error("prepare should not be reached before validation");
      },
    } as unknown as D1Database;

    const valid = {
      timeSlotId: "s1",
      trackId: "t1",
      roleId: "reception",
      min: 0,
      ideal: 2,
      leadMin: 0,
      newMax: 5,
    };
    const invalid = {
      timeSlotId: "s2",
      trackId: "t1",
      roleId: "guide",
      min: 0,
      ideal: 2,
      leadMin: 3,
      newMax: 5,
    };

    await expect(bulkUpsertDemands(fakeDb, "evt_1", [valid, invalid])).rejects.toBeInstanceOf(
      DemandValidationFailure,
    );
    expect(batchCalls).toEqual([]);
  });

  it("no-ops without touching the database for an empty input list", async () => {
    let batched = false;
    const fakeDb = {
      batch: async () => {
        batched = true;
        return [];
      },
    } as unknown as D1Database;
    await bulkUpsertDemands(fakeDb, "evt_1", []);
    expect(batched).toBe(false);
  });
});

/**
 * There's no real D1 wired into this workspace's vitest config (see
 * `events.server.test.ts`'s identical note), so `listDemandsForEvent`'s
 * bulk-read filter is pinned at the SQL-text level. `getDemand`'s
 * single-row SELECT is exempt here because it collapses `ideal_count <= 0`
 * to `null` via `demandOrNull` instead (covered above) — either mechanism
 * satisfies "ideal = 0 の行と行なしが同じ結果を返す".
 */
describe("ideal_count filtering", () => {
  it("listDemandsForEvent's SELECT includes `ideal_count > 0`", () => {
    const source = readFileSync(new URL("./demand.server.ts", import.meta.url), "utf8");
    const selects = source.match(/SELECT[\s\S]*?FROM demands WHERE event_id[^`]*/g) ?? [];
    expect(selects.length).toBeGreaterThan(0);
    for (const select of selects) {
      expect(select).toMatch(/ideal_count > 0/);
    }
  });
});
