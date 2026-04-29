export type Link = {
  id: number;
  slug: string;
  destinationUrl: string;
  title: string | null;
  description: string | null;
  ogImageUrl: string | null;
  ownerUserId: string;
  ownerChapterId: number | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

type LinkRow = {
  id: number;
  slug: string;
  destination_url: string;
  title: string | null;
  description: string | null;
  og_image_url: string | null;
  owner_user_id: string;
  owner_chapter_id: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

export function toLink(row: LinkRow): Link {
  return {
    id: row.id,
    slug: row.slug,
    destinationUrl: row.destination_url,
    title: row.title,
    description: row.description,
    ogImageUrl: row.og_image_url,
    ownerUserId: row.owner_user_id,
    ownerChapterId: row.owner_chapter_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

const LINK_COLS =
  "id, slug, destination_url, title, description, og_image_url, owner_user_id, owner_chapter_id, created_at, updated_at, deleted_at";

export async function listLinksForUser(db: D1Database, userId: string): Promise<Link[]> {
  const { results } = await db
    .prepare(
      `SELECT ${LINK_COLS} FROM links WHERE owner_user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
    )
    .bind(userId)
    .all<LinkRow>();
  return results.map(toLink);
}

export async function getLinkBySlug(db: D1Database, slug: string): Promise<Link | null> {
  const row = await db
    .prepare(`SELECT ${LINK_COLS} FROM links WHERE slug = ? AND deleted_at IS NULL`)
    .bind(slug)
    .first<LinkRow>();
  return row ? toLink(row) : null;
}

export async function getLinkById(db: D1Database, id: number): Promise<Link | null> {
  const row = await db
    .prepare(`SELECT ${LINK_COLS} FROM links WHERE id = ? AND deleted_at IS NULL`)
    .bind(id)
    .first<LinkRow>();
  return row ? toLink(row) : null;
}

export type CreateLinkInput = {
  slug: string;
  destinationUrl: string;
  title?: string | null;
  description?: string | null;
  ogImageUrl?: string | null;
  ownerUserId: string;
  ownerChapterId?: number | null;
};

export type CreateLinkResult =
  | { ok: true; link: Link }
  | { ok: false; reason: "slug_taken" };

export async function createLink(
  db: D1Database,
  input: CreateLinkInput,
): Promise<CreateLinkResult> {
  try {
    const row = await db
      .prepare(
        `INSERT INTO links (slug, destination_url, title, description, og_image_url, owner_user_id, owner_chapter_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING ${LINK_COLS}`,
      )
      .bind(
        input.slug,
        input.destinationUrl,
        input.title ?? null,
        input.description ?? null,
        input.ogImageUrl ?? null,
        input.ownerUserId,
        input.ownerChapterId ?? null,
      )
      .first<LinkRow>();
    if (!row) throw new Error("Insert returned no row");
    return { ok: true, link: toLink(row) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE")) return { ok: false, reason: "slug_taken" };
    throw err;
  }
}

export type UpdateLinkInput = {
  slug?: string;
  destinationUrl?: string;
  title?: string | null;
  description?: string | null;
  ogImageUrl?: string | null;
};

export async function updateLink(
  db: D1Database,
  id: number,
  input: UpdateLinkInput,
): Promise<Link | null> {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  if (input.slug !== undefined) {
    sets.push("slug = ?");
    values.push(input.slug);
  }
  if (input.destinationUrl !== undefined) {
    sets.push("destination_url = ?");
    values.push(input.destinationUrl);
  }
  if (input.title !== undefined) {
    sets.push("title = ?");
    values.push(input.title);
  }
  if (input.description !== undefined) {
    sets.push("description = ?");
    values.push(input.description);
  }
  if (input.ogImageUrl !== undefined) {
    sets.push("og_image_url = ?");
    values.push(input.ogImageUrl);
  }
  if (sets.length === 0) return getLinkById(db, id);
  sets.push("updated_at = unixepoch()");
  const row = await db
    .prepare(
      `UPDATE links SET ${sets.join(", ")} WHERE id = ? AND deleted_at IS NULL RETURNING ${LINK_COLS}`,
    )
    .bind(...values, id)
    .first<LinkRow>();
  return row ? toLink(row) : null;
}

export async function softDeleteLink(db: D1Database, id: number): Promise<void> {
  await db
    .prepare("UPDATE links SET deleted_at = unixepoch() WHERE id = ? AND deleted_at IS NULL")
    .bind(id)
    .run();
}
