import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { type TestD1Database, asD1, createTestD1 } from "../../../tests/helpers/sqlite-d1";
import {
  listAvailabilityForApplication,
  setAvailability,
  toAvailability,
} from "./availability.server";

const MIGRATIONS = [
  fileURLToPath(new URL("../../../migrations/0002_domain.sql", import.meta.url)),
  fileURLToPath(new URL("../../../migrations/0004_applications.sql", import.meta.url)),
];

const APPLICATION_ID = "app_1";
const SLOT_1 = "slot_1";
const SLOT_2 = "slot_2";

async function seedApplicationAndSlots(testDb: TestD1Database) {
  const now = new Date().toISOString();
  await testDb
    .prepare(
      `INSERT INTO events (id, chapter_id, name, date, start_time, end_time, seed, apply_token, view_token, created_at, updated_at)
       VALUES ('evt_1', 1, 'DevFest', '2026-11-07', '09:00', '19:00', 1, 'apply-tok', 'view-tok', ?, ?)`,
    )
    .bind(now, now)
    .run();
  await testDb
    .prepare(
      `INSERT INTO applications (id, event_id, user_id, email, name, created_at, updated_at)
       VALUES (?, 'evt_1', 'user_1', 'a@example.com', 'A', ?, ?)`,
    )
    .bind(APPLICATION_ID, now, now)
    .run();
  await testDb
    .prepare(
      "INSERT INTO time_slots (id, event_id, idx, start_time, end_time) VALUES (?, 'evt_1', 0, '09:00', '10:00')",
    )
    .bind(SLOT_1)
    .run();
  await testDb
    .prepare(
      "INSERT INTO time_slots (id, event_id, idx, start_time, end_time) VALUES (?, 'evt_1', 1, '10:00', '11:00')",
    )
    .bind(SLOT_2)
    .run();
}

describe("toAvailability", () => {
  it("maps snake_case columns to camelCase", () => {
    expect(toAvailability({ application_id: "app_1", time_slot_id: "slot_1", value: "o" })).toEqual(
      {
        applicationId: "app_1",
        timeSlotId: "slot_1",
        value: "o",
      },
    );
  });
});

describe("setAvailability / listAvailabilityForApplication (real SQLite)", () => {
  let testDb: TestD1Database;
  let db: D1Database;

  beforeEach(async () => {
    testDb = createTestD1(MIGRATIONS);
    db = asD1(testDb);
    await seedApplicationAndSlots(testDb);
  });

  it("stores one row per time slot", async () => {
    await setAvailability(db, APPLICATION_ID, [
      { timeSlotId: SLOT_1, value: "o" },
      { timeSlotId: SLOT_2, value: "x" },
    ]);
    const rows = await listAvailabilityForApplication(db, APPLICATION_ID);
    expect(rows).toEqual([
      { applicationId: APPLICATION_ID, timeSlotId: SLOT_1, value: "o" },
      { applicationId: APPLICATION_ID, timeSlotId: SLOT_2, value: "x" },
    ]);
  });

  it("wholesale-replaces the grid on a second call", async () => {
    await setAvailability(db, APPLICATION_ID, [{ timeSlotId: SLOT_1, value: "o" }]);
    await setAvailability(db, APPLICATION_ID, [
      { timeSlotId: SLOT_1, value: "x" },
      { timeSlotId: SLOT_2, value: "d" },
    ]);
    const rows = await listAvailabilityForApplication(db, APPLICATION_ID);
    expect(rows).toEqual([
      { applicationId: APPLICATION_ID, timeSlotId: SLOT_1, value: "x" },
      { applicationId: APPLICATION_ID, timeSlotId: SLOT_2, value: "d" },
    ]);
  });

  it("cascades deletes when the time slot is removed (ON DELETE CASCADE)", async () => {
    await setAvailability(db, APPLICATION_ID, [
      { timeSlotId: SLOT_1, value: "o" },
      { timeSlotId: SLOT_2, value: "o" },
    ]);
    await testDb.prepare("DELETE FROM time_slots WHERE id = ?").bind(SLOT_1).run();
    const rows = await listAvailabilityForApplication(db, APPLICATION_ID);
    expect(rows).toEqual([{ applicationId: APPLICATION_ID, timeSlotId: SLOT_2, value: "o" }]);
  });
});
