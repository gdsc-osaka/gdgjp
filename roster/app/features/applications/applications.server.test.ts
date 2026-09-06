import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { type TestD1Database, asD1, createTestD1 } from "../../../tests/helpers/sqlite-d1";
import {
  claimApplication,
  createApplication,
  getApplicationByEventAndEmail,
  getApplicationById,
  resolveOwnApplication,
  toApplication,
  updateApplication,
  withdrawApplication,
} from "./applications.server";

const MIGRATIONS = [
  fileURLToPath(new URL("../../../migrations/0002_domain.sql", import.meta.url)),
  fileURLToPath(new URL("../../../migrations/0004_applications.sql", import.meta.url)),
];

const EVENT_ID = "evt_1";

async function seedEvent(testDb: TestD1Database, id = EVENT_ID) {
  const now = new Date().toISOString();
  await testDb
    .prepare(
      `INSERT INTO events (id, chapter_id, name, date, start_time, end_time, seed, apply_token, view_token, created_at, updated_at)
       VALUES (?, 1, 'DevFest', '2026-11-07', '09:00', '19:00', 1, 'apply-tok', 'view-tok', ?, ?)`,
    )
    .bind(id, now, now)
    .run();
}

describe("toApplication", () => {
  it("maps snake_case columns to camelCase, converting withdrawn to a boolean", () => {
    const now = "2026-01-01T00:00:00.000Z";
    expect(
      toApplication({
        id: "app_1",
        event_id: "evt_1",
        user_id: "user_1",
        email: "a@example.com",
        name: "山田太郎",
        contact: "090-0000-0000",
        party: "yes",
        note: "note",
        withdrawn: 0,
        updated_by: "self",
        created_at: now,
        updated_at: now,
      }),
    ).toEqual({
      id: "app_1",
      eventId: "evt_1",
      userId: "user_1",
      email: "a@example.com",
      name: "山田太郎",
      contact: "090-0000-0000",
      party: "yes",
      note: "note",
      withdrawn: false,
      updatedBy: "self",
      createdAt: now,
      updatedAt: now,
    });
  });

  it("passes through a null user_id (proxy registration)", () => {
    const now = "2026-01-01T00:00:00.000Z";
    const app = toApplication({
      id: "app_2",
      event_id: "evt_1",
      user_id: null,
      email: "b@example.com",
      name: "B",
      contact: null,
      party: "undecided",
      note: null,
      withdrawn: 1,
      updated_by: "owner",
      created_at: now,
      updated_at: now,
    });
    expect(app.userId).toBeNull();
    expect(app.withdrawn).toBe(true);
  });
});

describe("createApplication dedup (real SQLite, migrated schema)", () => {
  let testDb: TestD1Database;
  let db: D1Database;

  beforeEach(async () => {
    testDb = createTestD1(MIGRATIONS);
    db = asD1(testDb);
    await seedEvent(testDb);
  });

  /**
   * docs/roster/04-applications.md "回帰として固定すべきテスト": a second
   * application with the same (event_id, email) must be rejected — this is
   * the dedup guarantee the whole proxy-registration design depends on.
   */
  it("rejects a second application with the same (event_id, email)", async () => {
    const first = await createApplication(db, EVENT_ID, {
      userId: "user_1",
      email: "dup@example.com",
      name: "First",
      contact: null,
      party: "undecided",
      note: null,
      updatedBy: "self",
    });
    expect(first.ok).toBe(true);

    const second = await createApplication(db, EVENT_ID, {
      userId: null,
      email: "dup@example.com",
      name: "Second",
      contact: null,
      party: "undecided",
      note: null,
      updatedBy: "owner",
    });
    expect(second).toEqual({ ok: false, reason: "duplicate_email" });
  });

  it("rejects a second application with the same (event_id, user_id)", async () => {
    const first = await createApplication(db, EVENT_ID, {
      userId: "user_1",
      email: "a@example.com",
      name: "First",
      contact: null,
      party: "undecided",
      note: null,
      updatedBy: "self",
    });
    expect(first.ok).toBe(true);

    const second = await createApplication(db, EVENT_ID, {
      userId: "user_1",
      email: "different@example.com",
      name: "Second",
      contact: null,
      party: "undecided",
      note: null,
      updatedBy: "self",
    });
    expect(second).toEqual({ ok: false, reason: "duplicate_user" });
  });

  it("allows any number of proxy registrations (user_id NULL) as long as emails differ", async () => {
    const first = await createApplication(db, EVENT_ID, {
      userId: null,
      email: "proxy1@example.com",
      name: "Proxy 1",
      contact: null,
      party: "undecided",
      note: null,
      updatedBy: "owner",
    });
    const second = await createApplication(db, EVENT_ID, {
      userId: null,
      email: "proxy2@example.com",
      name: "Proxy 2",
      contact: null,
      party: "undecided",
      note: null,
      updatedBy: "owner",
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
  });
});

describe("claimApplication", () => {
  let testDb: TestD1Database;
  let db: D1Database;

  beforeEach(async () => {
    testDb = createTestD1(MIGRATIONS);
    db = asD1(testDb);
    await seedEvent(testDb);
  });

  it("fills user_id on an unclaimed row", async () => {
    const created = await createApplication(db, EVENT_ID, {
      userId: null,
      email: "proxy@example.com",
      name: "Proxy",
      contact: null,
      party: "undecided",
      note: null,
      updatedBy: "owner",
    });
    if (!created.ok) throw new Error("setup failed");

    const claimed = await claimApplication(db, created.application.id, "user_9");
    expect(claimed?.userId).toBe("user_9");
  });

  /**
   * docs/roster/04-applications.md "回帰として固定すべきテスト": an
   * already-claimed row must never be claimable by someone else.
   */
  it("does nothing when the row is already claimed by someone else", async () => {
    const created = await createApplication(db, EVENT_ID, {
      userId: "user_1",
      email: "a@example.com",
      name: "A",
      contact: null,
      party: "undecided",
      note: null,
      updatedBy: "self",
    });
    if (!created.ok) throw new Error("setup failed");

    const claimed = await claimApplication(db, created.application.id, "user_2");
    expect(claimed).toBeNull();

    const unchanged = await getApplicationById(db, EVENT_ID, created.application.id);
    expect(unchanged?.userId).toBe("user_1");
  });
});

describe("resolveOwnApplication", () => {
  let testDb: TestD1Database;
  let db: D1Database;

  beforeEach(async () => {
    testDb = createTestD1(MIGRATIONS);
    db = asD1(testDb);
    await seedEvent(testDb);
  });

  it("returns new when the viewer has no application yet", async () => {
    const result = await resolveOwnApplication(db, EVENT_ID, {
      userId: "user_1",
      email: "a@example.com",
    });
    expect(result).toEqual({ kind: "new" });
  });

  it("auto-claims a proxy registration matching the viewer's email", async () => {
    const created = await createApplication(db, EVENT_ID, {
      userId: null,
      email: "proxy@example.com",
      name: "Proxy",
      contact: null,
      party: "undecided",
      note: null,
      updatedBy: "owner",
    });
    if (!created.ok) throw new Error("setup failed");

    const result = await resolveOwnApplication(db, EVENT_ID, {
      userId: "user_5",
      email: "proxy@example.com",
    });
    expect(result.kind).toBe("own");
    if (result.kind === "own") {
      expect(result.application.id).toBe(created.application.id);
      expect(result.application.userId).toBe("user_5");
    }
  });

  it("returns the viewer's own application without re-claiming it", async () => {
    const created = await createApplication(db, EVENT_ID, {
      userId: "user_1",
      email: "a@example.com",
      name: "A",
      contact: null,
      party: "undecided",
      note: null,
      updatedBy: "self",
    });
    if (!created.ok) throw new Error("setup failed");

    const result = await resolveOwnApplication(db, EVENT_ID, {
      userId: "user_1",
      email: "a@example.com",
    });
    expect(result).toEqual({ kind: "own", application: created.application });
  });
});

describe("updateApplication / withdrawApplication", () => {
  let testDb: TestD1Database;
  let db: D1Database;

  beforeEach(async () => {
    testDb = createTestD1(MIGRATIONS);
    db = asD1(testDb);
    await seedEvent(testDb);
  });

  it("overwrites the editable fields and updated_by, leaving email/userId untouched", async () => {
    const created = await createApplication(db, EVENT_ID, {
      userId: "user_1",
      email: "a@example.com",
      name: "Self-reported",
      contact: null,
      party: "undecided",
      note: null,
      updatedBy: "self",
    });
    if (!created.ok) throw new Error("setup failed");

    const updated = await updateApplication(db, created.application.id, {
      name: "Owner-corrected",
      contact: "070-1111-2222",
      party: "yes",
      note: "owner note",
      withdrawn: false,
      updatedBy: "owner",
    });
    expect(updated?.name).toBe("Owner-corrected");
    expect(updated?.updatedBy).toBe("owner");
    expect(updated?.email).toBe("a@example.com");
    expect(updated?.userId).toBe("user_1");
  });

  it("withdraws without touching name/contact/party/note", async () => {
    const created = await createApplication(db, EVENT_ID, {
      userId: "user_1",
      email: "a@example.com",
      name: "A",
      contact: "c",
      party: "yes",
      note: "n",
      updatedBy: "self",
    });
    if (!created.ok) throw new Error("setup failed");

    const withdrawn = await withdrawApplication(db, created.application.id, "self");
    expect(withdrawn?.withdrawn).toBe(true);
    expect(withdrawn?.name).toBe("A");
    expect(withdrawn?.contact).toBe("c");
    expect(withdrawn?.party).toBe("yes");
  });
});

describe("getApplicationByEventAndEmail", () => {
  it("returns null when no row matches", async () => {
    const testDb = createTestD1(MIGRATIONS);
    const db = asD1(testDb);
    await seedEvent(testDb);
    expect(await getApplicationByEventAndEmail(db, EVENT_ID, "nobody@example.com")).toBeNull();
  });
});
