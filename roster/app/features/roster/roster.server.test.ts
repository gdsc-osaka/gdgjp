import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { assignmentKey } from "~/features/solver/types";
import { type TestD1Database, asD1, createTestD1 } from "../../../tests/helpers/sqlite-d1";
import {
  readAssignments,
  readAssignmentsMap,
  toAssignment,
  writeAssignments,
} from "./roster.server";

const MIGRATIONS = [
  fileURLToPath(new URL("../../../migrations/0002_domain.sql", import.meta.url)),
  fileURLToPath(new URL("../../../migrations/0003_demands.sql", import.meta.url)),
  fileURLToPath(new URL("../../../migrations/0004_applications.sql", import.meta.url)),
  fileURLToPath(new URL("../../../migrations/0005_assignments.sql", import.meta.url)),
];

async function seedBase(db: TestD1Database, eventId: string) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO events (id, chapter_id, name, date, start_time, end_time, seed, apply_token, view_token, created_at, updated_at)
       VALUES (?, 1, 'DevFest', '2026-11-07', '09:00', '19:00', 1, ?, ?, ?, ?)`,
    )
    .bind(eventId, `apply_${eventId}`, `view_${eventId}`, now, now)
    .run();
  await db
    .prepare(
      "INSERT INTO tracks (id, event_id, name, color, shared, sort_order) VALUES (?, ?, '全体', '#000', 1, 0)",
    )
    .bind(`trk_${eventId}`, eventId)
    .run();
  await db
    .prepare(
      "INSERT INTO time_slots (id, event_id, idx, start_time, end_time) VALUES (?, ?, 0, '09:00', '10:00')",
    )
    .bind(`slot_${eventId}`, eventId)
    .run();
  await db
    .prepare(
      `INSERT INTO applications (id, event_id, user_id, email, name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(`app_${eventId}`, eventId, `user_${eventId}`, `${eventId}@example.com`, eventId, now, now)
    .run();
}

describe("toAssignment", () => {
  it("maps snake_case columns, including locked as a boolean", () => {
    expect(
      toAssignment({
        event_id: "evt_1",
        application_id: "app_1",
        time_slot_id: "slot_1",
        track_id: "trk_1",
        role_id: "reception",
        locked: 1,
      }),
    ).toEqual({
      eventId: "evt_1",
      applicationId: "app_1",
      timeSlotId: "slot_1",
      trackId: "trk_1",
      roleId: "reception",
      locked: true,
    });
  });
});

describe("writeAssignments / readAssignments / readAssignmentsMap", () => {
  let testDb: TestD1Database;

  beforeEach(async () => {
    testDb = createTestD1(MIGRATIONS);
    await seedBase(testDb, "evt_1");
    await seedBase(testDb, "evt_2");
  });

  it("round-trips a full assignments map through write then read", async () => {
    const next = new Map([
      [
        assignmentKey("app_evt_1", "slot_evt_1"),
        { trackId: "trk_evt_1", roleId: "reception", locked: false },
      ],
    ]);
    await writeAssignments(asD1(testDb), "evt_1", next);

    const rows = await readAssignments(asD1(testDb), "evt_1");
    expect(rows).toEqual([
      {
        eventId: "evt_1",
        applicationId: "app_evt_1",
        timeSlotId: "slot_evt_1",
        trackId: "trk_evt_1",
        roleId: "reception",
        locked: false,
      },
    ]);

    const map = await readAssignmentsMap(asD1(testDb), "evt_1");
    expect(map).toEqual(next);
  });

  it("a second write fully replaces the first — no stale rows survive", async () => {
    await writeAssignments(
      asD1(testDb),
      "evt_1",
      new Map([
        [
          assignmentKey("app_evt_1", "slot_evt_1"),
          { trackId: "trk_evt_1", roleId: "reception", locked: false },
        ],
      ]),
    );

    // A regenerate (or a manual edit) that no longer places this applicant
    // anywhere must leave zero rows behind for them, not a stray leftover
    // from the previous write.
    await writeAssignments(asD1(testDb), "evt_1", new Map());

    const rows = await readAssignments(asD1(testDb), "evt_1");
    expect(rows).toEqual([]);
  });

  it("never touches another event's assignments", async () => {
    await writeAssignments(
      asD1(testDb),
      "evt_1",
      new Map([
        [
          assignmentKey("app_evt_1", "slot_evt_1"),
          { trackId: "trk_evt_1", roleId: "reception", locked: false },
        ],
      ]),
    );
    await writeAssignments(
      asD1(testDb),
      "evt_2",
      new Map([
        [
          assignmentKey("app_evt_2", "slot_evt_2"),
          { trackId: "trk_evt_2", roleId: "guide", locked: true },
        ],
      ]),
    );

    // Re-writing evt_1 to empty must not disturb evt_2's row.
    await writeAssignments(asD1(testDb), "evt_1", new Map());

    const evt1Rows = await readAssignments(asD1(testDb), "evt_1");
    const evt2Rows = await readAssignments(asD1(testDb), "evt_2");
    expect(evt1Rows).toEqual([]);
    expect(evt2Rows).toHaveLength(1);
    expect(evt2Rows[0]).toMatchObject({ applicationId: "app_evt_2", locked: true });
  });

  it("persists locked as an integer and reads it back as a boolean", async () => {
    await writeAssignments(
      asD1(testDb),
      "evt_1",
      new Map([
        [
          assignmentKey("app_evt_1", "slot_evt_1"),
          { trackId: "trk_evt_1", roleId: "reception", locked: true },
        ],
      ]),
    );
    const map = await readAssignmentsMap(asD1(testDb), "evt_1");
    expect(map.get(assignmentKey("app_evt_1", "slot_evt_1"))).toEqual({
      trackId: "trk_evt_1",
      roleId: "reception",
      locked: true,
    });
  });

  it("readAssignments returns [] for an event with no assignments yet", async () => {
    const rows = await readAssignments(asD1(testDb), "evt_1");
    expect(rows).toEqual([]);
  });
});
