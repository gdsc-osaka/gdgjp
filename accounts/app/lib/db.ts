export type ChapterKind = "gdg" | "gdgoc";
export type Role = "organizer" | "member";
export type MembershipStatus = "pending" | "active";

export type Chapter = {
  id: number;
  slug: string;
  name: string;
  kind: ChapterKind;
  createdAt: number;
};

export type Membership = {
  userId: string;
  chapterId: number;
  role: Role;
  status: MembershipStatus;
  createdAt: number;
  approvedAt: number | null;
};

export type MembershipWithChapter = Membership & { chapter: Chapter };

type ChapterRow = {
  id: number;
  slug: string;
  name: string;
  kind: ChapterKind;
  created_at: number;
};

type MembershipRow = {
  user_id: string;
  chapter_id: number;
  role: Role;
  status: MembershipStatus;
  created_at: number;
  approved_at: number | null;
};

type MembershipJoinRow = MembershipRow & {
  c_id: number;
  c_slug: string;
  c_name: string;
  c_kind: ChapterKind;
  c_created_at: number;
};

function toChapter(row: ChapterRow): Chapter {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    createdAt: row.created_at,
  };
}

function toMembership(row: MembershipRow): Membership {
  return {
    userId: row.user_id,
    chapterId: row.chapter_id,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
  };
}

function toMembershipWithChapter(row: MembershipJoinRow): MembershipWithChapter {
  return {
    ...toMembership(row),
    chapter: {
      id: row.c_id,
      slug: row.c_slug,
      name: row.c_name,
      kind: row.c_kind,
      createdAt: row.c_created_at,
    },
  };
}

export async function listChapters(db: D1Database): Promise<Chapter[]> {
  const { results } = await db
    .prepare("SELECT id, slug, name, kind, created_at FROM chapters ORDER BY name")
    .all<ChapterRow>();
  return results.map(toChapter);
}

export async function getChapterBySlug(db: D1Database, slug: string): Promise<Chapter | null> {
  const row = await db
    .prepare("SELECT id, slug, name, kind, created_at FROM chapters WHERE slug = ?")
    .bind(slug)
    .first<ChapterRow>();
  return row ? toChapter(row) : null;
}

export async function getChapterById(db: D1Database, id: number): Promise<Chapter | null> {
  const row = await db
    .prepare("SELECT id, slug, name, kind, created_at FROM chapters WHERE id = ?")
    .bind(id)
    .first<ChapterRow>();
  return row ? toChapter(row) : null;
}

export async function createChapter(
  db: D1Database,
  input: { slug: string; name: string; kind: ChapterKind },
): Promise<void> {
  await db
    .prepare("INSERT INTO chapters (slug, name, kind) VALUES (?, ?, ?)")
    .bind(input.slug, input.name, input.kind)
    .run();
}

export async function deleteChapter(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM chapters WHERE id = ?").bind(id).run();
}

export async function getMembership(
  db: D1Database,
  userId: string,
): Promise<MembershipWithChapter | null> {
  const row = await db
    .prepare(
      `SELECT
         m.user_id, m.chapter_id, m.role, m.status, m.created_at, m.approved_at,
         c.id   AS c_id,
         c.slug AS c_slug,
         c.name AS c_name,
         c.kind AS c_kind,
         c.created_at AS c_created_at
       FROM memberships m
       JOIN chapters c ON c.id = m.chapter_id
       WHERE m.user_id = ?`,
    )
    .bind(userId)
    .first<MembershipJoinRow>();
  return row ? toMembershipWithChapter(row) : null;
}

export type RequestMembershipResult =
  | { ok: true }
  | { ok: false; reason: "already_has_membership" | "chapter_not_found" };

export async function requestMembership(
  db: D1Database,
  userId: string,
  chapterId: number,
): Promise<RequestMembershipResult> {
  const chapter = await getChapterById(db, chapterId);
  if (!chapter) return { ok: false, reason: "chapter_not_found" };
  const existing = await db
    .prepare("SELECT user_id FROM memberships WHERE user_id = ?")
    .bind(userId)
    .first<{ user_id: string }>();
  if (existing) return { ok: false, reason: "already_has_membership" };
  await db
    .prepare(
      "INSERT INTO memberships (user_id, chapter_id, role, status) VALUES (?, ?, 'member', 'pending')",
    )
    .bind(userId, chapterId)
    .run();
  return { ok: true };
}

export async function approveMembership(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare(
      "UPDATE memberships SET status = 'active', approved_at = unixepoch() WHERE user_id = ? AND status = 'pending'",
    )
    .bind(userId)
    .run();
}

export async function setRole(db: D1Database, userId: string, role: Role): Promise<void> {
  await db
    .prepare("UPDATE memberships SET role = ? WHERE user_id = ? AND status = 'active'")
    .bind(role, userId)
    .run();
}

export async function removeMembership(db: D1Database, userId: string): Promise<void> {
  await db.prepare("DELETE FROM memberships WHERE user_id = ?").bind(userId).run();
}

export async function listPendingForChapter(
  db: D1Database,
  chapterId: number,
): Promise<Membership[]> {
  const { results } = await db
    .prepare(
      "SELECT user_id, chapter_id, role, status, created_at, approved_at FROM memberships WHERE chapter_id = ? AND status = 'pending' ORDER BY created_at",
    )
    .bind(chapterId)
    .all<MembershipRow>();
  return results.map(toMembership);
}

export async function listMembersForChapter(
  db: D1Database,
  chapterId: number,
): Promise<Membership[]> {
  const { results } = await db
    .prepare(
      "SELECT user_id, chapter_id, role, status, created_at, approved_at FROM memberships WHERE chapter_id = ? AND status = 'active' ORDER BY role DESC, created_at",
    )
    .bind(chapterId)
    .all<MembershipRow>();
  return results.map(toMembership);
}
