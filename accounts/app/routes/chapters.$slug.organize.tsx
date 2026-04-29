import { type UserSummary, getUsersByIds, requireUser } from "@gdgjp/auth-lib";
import { ArrowLeft, Check, MoreHorizontal, X } from "lucide-react";
import { Form, Link, redirect } from "react-router";
import { PageShell } from "~/components/page-shell";
import { StatusBadge } from "~/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
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
  if (!u) return { name: id, email: "" };
  return { name: u.name || u.email || id, email: u.name ? u.email : "" };
}

export default function OrganizeChapter({ loaderData, actionData }: Route.ComponentProps) {
  const { chapter, pending, members, users } = loaderData;
  return (
    <PageShell>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground">
        <Link to="/dashboard">
          <ArrowLeft className="size-4" /> Back to dashboard
        </Link>
      </Button>

      <div className="space-y-1">
        <h1 className="text-3xl font-medium tracking-tight">Organize {chapter.name}</h1>
        <p className="font-mono text-xs text-muted-foreground">{chapter.slug}</p>
      </div>

      {actionData?.error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>Couldn't perform action</AlertTitle>
          <AlertDescription>{actionData.error}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Pending requests ({pending.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending requests.</p>
          ) : (
            <ul className="divide-y">
              {pending.map((m) => {
                const u = userLabel(users, m.userId);
                return (
                  <li
                    key={m.userId}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{u.name}</div>
                      {u.email ? (
                        <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Form method="post">
                        <input type="hidden" name="intent" value="approve" />
                        <input type="hidden" name="userId" value={m.userId} />
                        <Button type="submit" size="sm">
                          <Check className="size-4" /> Approve
                        </Button>
                      </Form>
                      <Form method="post">
                        <input type="hidden" name="intent" value="remove" />
                        <input type="hidden" name="userId" value={m.userId} />
                        <Button type="submit" size="sm" variant="outline">
                          <X className="size-4" /> Reject
                        </Button>
                      </Form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Members ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          ) : (
            <ul className="divide-y">
              {members.map((m) => {
                const u = userLabel(users, m.userId);
                const isOrganizer = m.role === "organizer";
                return (
                  <li
                    key={m.userId}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <StatusBadge status={isOrganizer ? "organizer" : "member"}>
                        {isOrganizer ? "Organizer" : "Member"}
                      </StatusBadge>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{u.name}</div>
                        {u.email ? (
                          <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                        ) : null}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Manage ${u.name}`}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <Form method="post">
                          <input
                            type="hidden"
                            name="intent"
                            value={isOrganizer ? "demote" : "promote"}
                          />
                          <input type="hidden" name="userId" value={m.userId} />
                          <DropdownMenuItem asChild>
                            <button type="submit" className="w-full text-left">
                              {isOrganizer ? "Demote to member" : "Promote to organizer"}
                            </button>
                          </DropdownMenuItem>
                        </Form>
                        <DropdownMenuSeparator />
                        <Form method="post">
                          <input type="hidden" name="intent" value="remove" />
                          <input type="hidden" name="userId" value={m.userId} />
                          <DropdownMenuItem asChild variant="destructive">
                            <button type="submit" className="w-full text-left">
                              Remove from chapter
                            </button>
                          </DropdownMenuItem>
                        </Form>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
