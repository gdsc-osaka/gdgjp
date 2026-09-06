import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toEvent } from "./events.server";

const ROW = {
  id: "evt_1",
  chapter_id: 42,
  name: "DevFest 2026",
  date: "2026-11-07",
  start_time: "09:00",
  end_time: "19:00",
  step_min: 60,
  tz: "Asia/Tokyo",
  status: "draft",
  has_party: 1,
  no_solo_newcomer: 1,
  max_consecutive: 4,
  seed: 123456,
  apply_token: "a".repeat(40),
  view_token: "b".repeat(40),
  created_by: "user_1",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  deleted_at: null,
} as const;

describe("toEvent", () => {
  it("maps snake_case columns to camelCase, converting 0/1 flags to booleans", () => {
    expect(toEvent(ROW)).toEqual({
      id: "evt_1",
      chapterId: 42,
      name: "DevFest 2026",
      date: "2026-11-07",
      startTime: "09:00",
      endTime: "19:00",
      stepMin: 60,
      tz: "Asia/Tokyo",
      status: "draft",
      hasParty: true,
      noSoloNewcomer: true,
      maxConsecutive: 4,
      seed: 123456,
      applyToken: "a".repeat(40),
      viewToken: "b".repeat(40),
      createdBy: "user_1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      deletedAt: null,
    });
  });

  it("maps has_party=0 / no_solo_newcomer=0 to false", () => {
    const event = toEvent({ ...ROW, has_party: 0, no_solo_newcomer: 0 });
    expect(event.hasParty).toBe(false);
    expect(event.noSoloNewcomer).toBe(false);
  });

  it("passes through created_by and deleted_at nulls", () => {
    const event = toEvent({ ...ROW, created_by: null, deleted_at: "2026-02-01T00:00:00.000Z" });
    expect(event.createdBy).toBeNull();
    expect(event.deletedAt).toBe("2026-02-01T00:00:00.000Z");
  });
});

/**
 * docs/roster/02-domain-schema.md "回帰として固定すべきテスト": every read
 * of `events` must filter `deleted_at IS NULL`, or a soft-deleted event
 * would resurface in the list / design page. There's no real D1 wired into
 * this workspace's vitest config (see `scheduler/app/lib/db.test.ts` for the
 * same pure-mapper-only convention), so this pins it at the SQL-text level
 * instead: every `SELECT ... FROM events` in this file must include the
 * filter.
 */
describe("deleted_at filtering", () => {
  it("every SELECT FROM events includes `deleted_at IS NULL`", () => {
    const source = readFileSync(new URL("./events.server.ts", import.meta.url), "utf8");
    const selects = source.match(/SELECT[\s\S]*?FROM events[^`]*/g) ?? [];
    expect(selects.length).toBeGreaterThan(0);
    for (const select of selects) {
      expect(select).toMatch(/deleted_at IS NULL/);
    }
  });
});
