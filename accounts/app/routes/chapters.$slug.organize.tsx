import { type UserSummary, getUsersByIds, requireUser } from "@gdgjp/auth-lib";
import { Form, Link, redirect } from "react-router";
import {
  approveMembership,
  getChapterBySlug,
  getMembership,
  listMembersForChapter,
  listPendingForChapter,
  removeMembership,
  setRole,
} from "~/lib/db";
import { canManageChapter } from "~/lib/permissions";
import type { Route } from "./+types/chapters.$slug.organize";

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `Organize ${params.slug} — GDG Japan Accounts` }];
}

async function ensureAccess(args: Route.LoaderArgs | Route.ActionArgs) {
  const env = args.context.cloudflare.env;
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(args.request, {
      publishableKey: env.CLERK_PUBLISHABLE_KEY,
      secretKey: env.CLERK_SECRET_KEY,
    });
  } catch {
    throw redirect("/sign-in");
  }
  const slug = args.params.slug;
  if (!slug) throw new Response("Not found", { status: 404 });
  const chapter = await getChapterBySlug(env.DB, slug);
  if (!chapter) throw new Response("Chapter not found", { status: 404 });
  const viewerMembership = await getMembership(env.DB, user.id);
  if (!canManageChapter(user, chapter.id, viewerMembership)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return { env, user, chapter };
}

export async function loader(args: Route.LoaderArgs) {
  const { env, chapter } = await ensureAccess(args);
  const [pending, members] = await Promise.all([
    listPendingForChapter(env.DB, chapter.id),
    listMembersForChapter(env.DB, chapter.id),
  ]);
  const ids = [...pending.map((m) => m.userId), ...members.map((m) => m.userId)];
  const users = await getUsersByIds(ids, {
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    secretKey: env.CLERK_SECRET_KEY,
  });
  return { chapter, pending, members, users };
}

export async function action(args: Route.ActionArgs) {
  const { env, chapter } = await ensureAccess(args);
  const form = await args.request.formData();
  const intent = form.get("intent");
  const targetUserId = String(form.get("userId") ?? "");
  if (!targetUserId) return { error: "Missing user." };

  const target = await getMembership(env.DB, targetUserId);
  if (!target || target.chapter.id !== chapter.id) {
    return { error: "User is not in this chapter." };
  }

  switch (intent) {
    case "approve":
      await approveMembership(env.DB, targetUserId);
      return null;
    case "promote":
      await setRole(env.DB, targetUserId, "organizer");
      return null;
    case "demote":
      await setRole(env.DB, targetUserId, "member");
      return null;
    case "remove":
      await removeMembership(env.DB, targetUserId);
      return null;
    default:
      return { error: "Unknown action." };
  }
}

function userLabel(users: Record<string, UserSummary>, id: string) {
  const u = users[id];
  if (!u) return id;
  return u.name ? `${u.name} (${u.email})` : u.email || id;
}

export default function OrganizeChapter({ loaderData, actionData }: Route.ComponentProps) {
  const { chapter, pending, members, users } = loaderData;
  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
      <p>
        <Link to="/dashboard">← Back to dashboard</Link>
      </p>
      <h1>Organize {chapter.name}</h1>

      <section>
        <h2>Pending requests ({pending.length})</h2>
        {pending.length === 0 ? (
          <p>No pending requests.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {pending.map((m) => (
              <li key={m.userId} style={{ margin: "0.5rem 0" }}>
                {userLabel(users, m.userId)}{" "}
                <Form method="post" style={{ display: "inline" }}>
                  <input type="hidden" name="intent" value="approve" />
                  <input type="hidden" name="userId" value={m.userId} />
                  <button type="submit">Approve</button>
                </Form>{" "}
                <Form method="post" style={{ display: "inline" }}>
                  <input type="hidden" name="intent" value="remove" />
                  <input type="hidden" name="userId" value={m.userId} />
                  <button type="submit">Reject</button>
                </Form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Members ({members.length})</h2>
        {members.length === 0 ? (
          <p>No members yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {members.map((m) => (
              <li key={m.userId} style={{ margin: "0.5rem 0" }}>
                <strong>{m.role === "organizer" ? "Organizer" : "Member"}</strong> —{" "}
                {userLabel(users, m.userId)}{" "}
                <Form method="post" style={{ display: "inline" }}>
                  <input
                    type="hidden"
                    name="intent"
                    value={m.role === "organizer" ? "demote" : "promote"}
                  />
                  <input type="hidden" name="userId" value={m.userId} />
                  <button type="submit">
                    {m.role === "organizer" ? "Demote to member" : "Promote to organizer"}
                  </button>
                </Form>{" "}
                <Form method="post" style={{ display: "inline" }}>
                  <input type="hidden" name="intent" value="remove" />
                  <input type="hidden" name="userId" value={m.userId} />
                  <button type="submit">Remove</button>
                </Form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {actionData?.error ? <p style={{ color: "crimson" }}>{actionData.error}</p> : null}
    </main>
  );
}
