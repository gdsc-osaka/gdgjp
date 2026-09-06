import { describe, expect, it } from "vitest";
import { toPhase, toTimeSlot } from "./schedule.server";

describe("toPhase", () => {
  it("maps snake_case columns to camelCase", () => {
    expect(
      toPhase({
        id: "phase_1",
        event_id: "evt_1",
        name: "開場前",
        from_time: "09:00",
        to_time: "10:00",
        sort_order: 0,
      }),
    ).toEqual({
      id: "phase_1",
      eventId: "evt_1",
      name: "開場前",
      from: "09:00",
      to: "10:00",
      sortOrder: 0,
    });
  });
});

describe("toTimeSlot", () => {
  it("maps snake_case columns to camelCase, passing through a null phase_id", () => {
    expect(
      toTimeSlot({
        id: "slot_1",
        event_id: "evt_1",
        idx: 3,
        start_time: "12:00",
        end_time: "13:00",
        phase_id: null,
      }),
    ).toEqual({
      id: "slot_1",
      eventId: "evt_1",
      idx: 3,
      start: "12:00",
      end: "13:00",
      phaseId: null,
    });
  });

  it("passes through a non-null phase_id", () => {
    const slot = toTimeSlot({
      id: "slot_2",
      event_id: "evt_1",
      idx: 0,
      start_time: "09:00",
      end_time: "10:00",
      phase_id: "phase_1",
    });
    expect(slot.phaseId).toBe("phase_1");
  });
});
