import type { EventStatus } from "./status";

/**
 * D1 access for the `events` table (docs/roster/02-domain-schema.md "Design"
 * §1, §4). Follows `scheduler/app/lib/db.ts`'s pattern: a snake_case `*Row`
 * type, a `to*()` mapper, a column-list constant reused by every query, and
 * `RETURNING <COLS>` on every write.
 *
 * Time slots / phases / tracks / event_roles are a different table cluster
 * with their own lifecycle (regenerated as a unit on schedule changes) — see
 * `~/features/schedule/schedule.server` and `~/features/schedule/tracks.server`.
 */

export type EventRecord = {
  id: string;
  chapterId: number;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  stepMin: number;
  tz: string;
  status: EventStatus;
  hasParty: boolean;
  noSoloNewcomer: boolean;
  maxConsecutive: number;
  seed: number;
  applyToken: string;
  viewToken: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type EventRow = {
  id: string;
  chapter_id: number;
  name: string;
  date: string;
  start_time: string;
  end_time: string;
  step_min: number;
  tz: string;
  status: string;
  has_party: number;
  no_solo_newcomer: number;
  max_consecutive: number;
  seed: number;
  apply_token: string;
  view_token: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const EVENT_COLS = [
  "id",
  "chapter_id",
  "name",
  "date",
  "start_time",
  "end_time",
  "step_min",
  "tz",
  "status",
  "has_party",
  "no_solo_newcomer",
  "max_consecutive",
  "seed",
  "apply_token",
  "view_token",
  "created_by",
  "created_at",
  "updated_at",
  "deleted_at",
].join(", ");

export function toEvent(r: EventRow): EventRecord {
  return {
    id: r.id,
    chapterId: r.chapter_id,
    name: r.name,
    date: r.date,
    startTime: r.start_time,
    endTime: r.end_time,
    stepMin: r.step_min,
    tz: r.tz,
    status: r.status as EventStatus,
    hasParty: r.has_party === 1,
    noSoloNewcomer: r.no_solo_newcomer === 1,
    maxConsecutive: r.max_consecutive,
    seed: r.seed,
    applyToken: r.apply_token,
    viewToken: r.view_token,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

/**
 * `apply_token` / `view_token` must be unpredictable and independent of
 * `id` (docs/roster/02-domain-schema.md "Design" §1) — 20 random bytes,
 * hex-encoded, never derived from the event id.
 */
function randomToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A solver seed (Stage 06) — any 32-bit unsigned int, fixed at creation for reproducibility. */
function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

export type CreateEventInput = {
  chapterId: number;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  stepMin: number;
  createdBy: string | null;
};

export async function createEvent(db: D1Database, input: CreateEventInput): Promise<EventRecord> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const row = await db
    .prepare(
      `INSERT INTO events
         (id, chapter_id, name, date, start_time, end_time, step_min, seed,
          apply_token, view_token, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING ${EVENT_COLS}`,
    )
    .bind(
      id,
      input.chapterId,
      input.name,
      input.date,
      input.startTime,
      input.endTime,
      input.stepMin,
      randomSeed(),
      randomToken(),
      randomToken(),
      input.createdBy,
      now,
      now,
    )
    .first<EventRow>();
  if (!row) throw new Error("Event insert returned no row");
  return toEvent(row);
}

export async function getEvent(db: D1Database, id: string): Promise<EventRecord | null> {
  const row = await db
    .prepare(`SELECT ${EVENT_COLS} FROM events WHERE id = ? AND deleted_at IS NULL`)
    .bind(id)
    .first<EventRow>();
  return row ? toEvent(row) : null;
}

/** Chapter's events, newest event date first (docs/roster/02-domain-schema.md screen `/`). */
export async function listEventsForChapters(
  db: D1Database,
  chapterIds: readonly number[],
): Promise<EventRecord[]> {
  if (chapterIds.length === 0) return [];
  const placeholders = chapterIds.map(() => "?").join(", ");
  const { results } = await db
    .prepare(
      `SELECT ${EVENT_COLS} FROM events
       WHERE deleted_at IS NULL AND chapter_id IN (${placeholders})
       ORDER BY date DESC, start_time DESC`,
    )
    .bind(...chapterIds)
    .all<EventRow>();
  return (results ?? []).map(toEvent);
}

export type UpdateEventSettingsInput = {
  stepMin: number;
  status: EventStatus;
  maxConsecutive: number;
  noSoloNewcomer: boolean;
};

/**
 * Updates the "イベント設定" card fields (docs/roster/02-domain-schema.md
 * "Design" §6). Name / date / start / end aren't editable from this stage's
 * UI — see the PR description for why — so they aren't touched here.
 */
export async function updateEventSettings(
  db: D1Database,
  id: string,
  input: UpdateEventSettingsInput,
): Promise<EventRecord | null> {
  const now = new Date().toISOString();
  const row = await db
    .prepare(
      `UPDATE events
       SET step_min = ?, status = ?, max_consecutive = ?, no_solo_newcomer = ?, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL
       RETURNING ${EVENT_COLS}`,
    )
    .bind(input.stepMin, input.status, input.maxConsecutive, input.noSoloNewcomer ? 1 : 0, now, id)
    .first<EventRow>();
  return row ? toEvent(row) : null;
}
