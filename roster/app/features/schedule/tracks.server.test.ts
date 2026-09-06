import { describe, expect, it } from "vitest";
import { toRole, toTrack } from "./tracks.server";

describe("toTrack", () => {
  it("maps snake_case columns to camelCase, converting shared to a boolean", () => {
    expect(
      toTrack({
        id: "trk_1",
        event_id: "evt_1",
        name: "全体",
        color: "#4285f4",
        shared: 1,
        sort_order: 0,
      }),
    ).toEqual({
      id: "trk_1",
      eventId: "evt_1",
      name: "全体",
      color: "#4285f4",
      shared: true,
      sortOrder: 0,
    });
  });

  it("maps shared=0 to false", () => {
    const track = toTrack({
      id: "trk_2",
      event_id: "evt_1",
      name: "Track A",
      color: "#ea4335",
      shared: 0,
      sort_order: 1,
    });
    expect(track.shared).toBe(false);
  });
});

describe("toRole", () => {
  it("maps snake_case columns to camelCase", () => {
    expect(toRole({ id: "reception", name: "受付", sort_order: 1 })).toEqual({
      id: "reception",
      name: "受付",
      sortOrder: 1,
    });
  });
});
