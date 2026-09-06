import { describe, expect, it } from "vitest";
import { STATUSES, canApply, canView, isEventStatus } from "./status";

/**
 * These two predicates are the entire access-control surface for the public
 * URLs (docs/roster/02-domain-schema.md "回帰として固定すべきテスト").
 * Pin all 5 statuses × 2 predicates explicitly so a silent change here can't
 * expose an unpublished schedule or open registration early.
 */
describe("canApply", () => {
  it.each(STATUSES)("status=%s", (status) => {
    expect(canApply(status)).toBe(status === "open");
  });
});

describe("canView", () => {
  it.each(STATUSES)("status=%s", (status) => {
    expect(canView(status)).toBe(status === "published");
  });
});

describe("isEventStatus", () => {
  it("accepts every known status", () => {
    for (const status of STATUSES) expect(isEventStatus(status)).toBe(true);
  });

  it("rejects unknown strings", () => {
    expect(isEventStatus("archived")).toBe(false);
    expect(isEventStatus("")).toBe(false);
    expect(isEventStatus("Draft")).toBe(false);
  });
});
