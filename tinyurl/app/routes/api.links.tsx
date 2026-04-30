import { requireUser } from "@gdgjp/auth-lib";
import { redirect } from "react-router";
import { buildSignInRedirect } from "~/lib/auth-redirect";
import { clerkAuthOptions } from "~/lib/clerk-options";
import { addComment, createLink, createTag, setLinkTags } from "~/lib/db";
import { type OgpData, fetchOgp } from "~/lib/ogp";
import { generateRandomSlug, validateSlug } from "~/lib/slug";
import type { Route } from "./+types/api.links";

export type ApiLinksActionData = { error: string } | { ogp: OgpData | null } | null;

export async function action(args: Route.ActionArgs): Promise<ApiLinksActionData> {
  const env = args.context.cloudflare.env;
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(args.request, clerkAuthOptions(env));
  } catch {
    throw buildSignInRedirect(args.request, env);
  }

  const form = await args.request.formData();
  const intent = String(form.get("intent") ?? "create");

  if (intent === "fetchOgp") {
    const url = String(form.get("destinationUrl") ?? "").trim();
    try {
      new URL(url);
    } catch {
      return { ogp: null };
    }
    return { ogp: await fetchOgp(url) };
  }

  const rawSlug = String(form.get("slug") ?? "").trim();
  const destinationUrl = String(form.get("destinationUrl") ?? "").trim();
  const title = String(form.get("title") ?? "").trim() || null;
  const description = String(form.get("description") ?? "").trim() || null;
  const ogImageUrl = String(form.get("ogImageUrl") ?? "").trim() || null;
  const tagIds = form
    .getAll("tagId")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
  const newTagNames = form
    .getAll("newTagName")
    .map((v) => String(v).trim())
    .filter((n) => n.length > 0 && n.length <= 32);
  const commentBody = String(form.get("comment") ?? "").trim();

  if (!destinationUrl) return { error: "Destination URL is required." };
  try {
    new URL(destinationUrl);
  } catch {
    return { error: "Destination URL is not a valid URL." };
  }

  async function applyExtras(linkId: number) {
    const finalTagIds = new Set(tagIds);
    for (const name of newTagNames) {
      const result = await createTag(env.DB, { name, color: null, ownerUserId: user.id });
      if (result.ok) {
        finalTagIds.add(result.tag.id);
      } else {
        const row = await env.DB.prepare(
          "SELECT id FROM tags WHERE name = ? AND (owner_user_id = ? OR owner_user_id IS NULL)",
        )
          .bind(name, user.id)
          .first<{ id: number }>();
        if (row?.id) finalTagIds.add(row.id);
      }
    }
    if (finalTagIds.size > 0) await setLinkTags(env.DB, linkId, [...finalTagIds]);
    if (commentBody && commentBody.length <= 2000) {
      await addComment(env.DB, { linkId, authorUserId: user.id, body: commentBody });
    }
  }

  let slug = rawSlug;
  if (!slug) {
    for (let attempt = 0; attempt < 5; attempt++) {
      slug = generateRandomSlug(8);
      const result = await createLink(env.DB, {
        slug,
        destinationUrl,
        title,
        description,
        ogImageUrl,
        ownerUserId: user.id,
      });
      if (result.ok) {
        await applyExtras(result.link.id);
        throw redirect(`/links/${result.link.id}`);
      }
    }
    return { error: "Could not generate a unique slug. Please try again." };
  }

  const validation = validateSlug(slug);
  if (!validation.ok) {
    return {
      error:
        validation.reason === "reserved"
          ? `"${slug}" is a reserved slug.`
          : "Slug may only contain letters, numbers, hyphens, and underscores (1–64 chars).",
    };
  }

  const result = await createLink(env.DB, {
    slug,
    destinationUrl,
    title,
    description,
    ogImageUrl,
    ownerUserId: user.id,
  });
  if (!result.ok) return { error: `The slug "${slug}" is already taken.` };
  await applyExtras(result.link.id);
  throw redirect(`/links/${result.link.id}`);
}
