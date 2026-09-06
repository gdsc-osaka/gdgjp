/**
 * D1 access for `tracks`, the seeded `roles` master, and `event_roles`
 * (docs/roster/index.md §3 "役割マスタ" / "トラック", §4). Split out of
 * `schedule.server.ts` to keep each file under the 400-line cap
 * (docs/roster/02-domain-schema.md "Design" §4: split by domain, not by
 * read/write) — tracks/roles have no idx-contiguity concern, so they don't
 * share schedule.server.ts's regenerate machinery.
 */

export type Track = {
  id: string;
  eventId: string;
  name: string;
  color: string;
  shared: boolean;
  sortOrder: number;
};

export type Role = { id: string; name: string; sortOrder: number };

type TrackRow = {
  id: string;
  event_id: string;
  name: string;
  color: string;
  shared: number;
  sort_order: number;
};

type RoleRow = { id: string; name: string; sort_order: number };

const TRACK_COLS = "id, event_id, name, color, shared, sort_order";
const ROLE_COLS = "id, name, sort_order";

export function toTrack(r: TrackRow): Track {
  return {
    id: r.id,
    eventId: r.event_id,
    name: r.name,
    color: r.color,
    shared: r.shared === 1,
    sortOrder: r.sort_order,
  };
}

export function toRole(r: RoleRow): Role {
  return { id: r.id, name: r.name, sortOrder: r.sort_order };
}

export async function listTracks(db: D1Database, eventId: string): Promise<Track[]> {
  const { results } = await db
    .prepare(`SELECT ${TRACK_COLS} FROM tracks WHERE event_id = ? ORDER BY sort_order`)
    .bind(eventId)
    .all<TrackRow>();
  return (results ?? []).map(toTrack);
}

export type CreateTrackInput = { name: string; color: string; shared: boolean };

export async function createTrack(
  db: D1Database,
  eventId: string,
  input: CreateTrackInput,
): Promise<Track> {
  const { results } = await db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM tracks WHERE event_id = ?")
    .bind(eventId)
    .all<{ next: number }>();
  const sortOrder = results?.[0]?.next ?? 0;

  const row = await db
    .prepare(
      `INSERT INTO tracks (id, event_id, name, color, shared, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING ${TRACK_COLS}`,
    )
    .bind(crypto.randomUUID(), eventId, input.name, input.color, input.shared ? 1 : 0, sortOrder)
    .first<TrackRow>();
  if (!row) throw new Error("Track insert returned no row");
  return toTrack(row);
}

export async function deleteTrack(db: D1Database, id: string, eventId: string): Promise<void> {
  await db.prepare("DELETE FROM tracks WHERE id = ? AND event_id = ?").bind(id, eventId).run();
}

/**
 * No UNIQUE(event_id, sort_order) constraint on tracks (unlike
 * time_slots.idx), so a plain per-row UPDATE batch is safe — there's no
 * transient-collision risk to guard against.
 */
export async function reorderTracks(
  db: D1Database,
  eventId: string,
  orderedIds: readonly string[],
): Promise<void> {
  if (orderedIds.length === 0) return;
  const statements = orderedIds.map((id, i) =>
    db
      .prepare("UPDATE tracks SET sort_order = ? WHERE id = ? AND event_id = ?")
      .bind(i, id, eventId),
  );
  await db.batch(statements);
}

/** All 6 system-seeded roles (ADR-007), sorted for display. No write path — see Non-Goal. */
export async function listRoles(db: D1Database): Promise<Role[]> {
  const { results } = await db
    .prepare(`SELECT ${ROLE_COLS} FROM roles ORDER BY sort_order`)
    .all<RoleRow>();
  return (results ?? []).map(toRole);
}

export async function listEventRoleIds(db: D1Database, eventId: string): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT role_id FROM event_roles WHERE event_id = ?")
    .bind(eventId)
    .all<{ role_id: string }>();
  return (results ?? []).map((r) => r.role_id);
}

/** Replaces the event's role selection wholesale (delete-all-then-insert, like scheduler's setAvailability). */
export async function setEventRoles(
  db: D1Database,
  eventId: string,
  roleIds: readonly string[],
): Promise<void> {
  const statements: D1PreparedStatement[] = [
    db.prepare("DELETE FROM event_roles WHERE event_id = ?").bind(eventId),
  ];
  for (const roleId of roleIds) {
    statements.push(
      db.prepare("INSERT INTO event_roles (event_id, role_id) VALUES (?, ?)").bind(eventId, roleId),
    );
  }
  await db.batch(statements);
}
