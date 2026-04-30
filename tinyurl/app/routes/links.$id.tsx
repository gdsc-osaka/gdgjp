import { type UserSummary, getUserChapter, getUsersByIds, requireUser } from "@gdgjp/auth-lib";
import { ArrowLeft, BarChart3, RefreshCw, Trash2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Form, Link, redirect } from "react-router";
import { PageShell } from "~/components/page-shell";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { buildSignInRedirect } from "~/lib/auth-redirect";
import { clerkAuthOptions } from "~/lib/clerk-options";
import {
  type LinkPermission,
  addComment,
  addPermission,
  createTag,
  deleteComment,
  getLinkById,
  listComments,
  listPermissionsForLink,
  listTagsForChapter,
  listTagsForLink,
  listTagsForUser,
  removePermission,
  setLinkTags,
  softDeleteLink,
  updateLink,
  updatePermissionRole,
} from "~/lib/db";
import { fetchOgp } from "~/lib/ogp";
import { type ViewerContext, canEditLink, canViewLink } from "~/lib/permissions";
import { validateSlug } from "~/lib/slug";
import type { Route } from "./+types/links.$id";

async function ensureAccess(args: Route.LoaderArgs | Route.ActionArgs) {
  const env = args.context.cloudflare.env;
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(args.request, clerkAuthOptions(env));
  } catch {
    throw buildSignInRedirect(args.request, env);
  }
  const id = Number(args.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new Response("Not found", { status: 404 });
  const link = await getLinkById(env.DB, id);
  if (!link) throw new Response("Not found", { status: 404 });
  const permissions = await listPermissionsForLink(env.DB, id);
  const chapter = await getUserChapter(user.id, {
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    secretKey: env.CLERK_SECRET_KEY,
  });
  const ctx: ViewerContext = { user, chapterId: chapter?.chapterId ?? null };
  if (!canViewLink(ctx, link, permissions)) {
    throw new Response("Forbidden", { status: 403 });
  }
  const editable = canEditLink(ctx, link, permissions);
  return { env, user, chapter, link, permissions, ctx, editable, id };
}

export async function loader(args: Route.LoaderArgs) {
  const { env, user, chapter, link, permissions, editable } = await ensureAccess(args);
  const [tags, userTags, chapterTags, comments] = await Promise.all([
    listTagsForLink(env.DB, link.id),
    listTagsForUser(env.DB, user.id),
    chapter ? listTagsForChapter(env.DB, chapter.chapterId) : Promise.resolve([]),
    listComments(env.DB, link.id),
  ]);
  const userIds = new Set<string>([link.ownerUserId, ...comments.map((c) => c.authorUserId)]);
  const users = await getUsersByIds([...userIds], {
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    secretKey: env.CLERK_SECRET_KEY,
  });
  return {
    link,
    permissions,
    tags,
    availableTags: [...userTags, ...chapterTags],
    comments,
    users,
    editable,
    appUrl: env.APP_URL,
    shortUrlBase: env.SHORT_URL_BASE,
  };
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.link.slug ?? "Link"} — GDG Japan Links` }];
}

export async function action(args: Route.ActionArgs) {
  const { env, user, link, editable, id } = await ensureAccess(args);
  const form = await args.request.formData();
  const intent = form.get("intent");

  if (intent === "addComment") {
    const body = String(form.get("body") ?? "").trim();
    if (!body) return { error: "Comment body is required." };
    if (body.length > 2000) return { error: "Comment is too long (max 2000 chars)." };
    await addComment(env.DB, { linkId: id, authorUserId: user.id, body });
    return { success: "Comment posted." };
  }

  if (intent === "deleteComment") {
    const commentId = Number(form.get("commentId"));
    if (!Number.isInteger(commentId) || commentId <= 0) return { error: "Invalid comment id." };
    if (!editable) return { error: "You don't have permission to delete comments." };
    await deleteComment(env.DB, commentId);
    return null;
  }

  if (!editable) return { error: "You don't have permission to edit this link." };

  if (intent === "delete") {
    await softDeleteLink(env.DB, id);
    throw redirect("/dashboard");
  }

  if (intent === "update") {
    const slug = String(form.get("slug") ?? "").trim();
    const destinationUrl = String(form.get("destinationUrl") ?? "").trim();
    const title = String(form.get("title") ?? "").trim() || null;
    const description = String(form.get("description") ?? "").trim() || null;
    const ogImageUrl = String(form.get("ogImageUrl") ?? "").trim() || null;

    if (!destinationUrl) return { error: "Destination URL is required." };
    try {
      new URL(destinationUrl);
    } catch {
      return { error: "Destination URL is not a valid URL." };
    }
    if (!slug) return { error: "Slug is required." };

    const validation = validateSlug(slug);
    if (!validation.ok) {
      return {
        error:
          validation.reason === "reserved"
            ? `"${slug}" is a reserved slug.`
            : "Slug may only contain letters, numbers, hyphens, and underscores (1–64 chars).",
      };
    }

    try {
      await updateLink(env.DB, id, { slug, destinationUrl, title, description, ogImageUrl });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("UNIQUE")) return { error: `The slug "${slug}" is already taken.` };
      throw err;
    }
    return { success: "Saved." };
  }

  if (intent === "fetchOgp") {
    const ogp = await fetchOgp(link.destinationUrl);
    if (!ogp) return { error: "Could not fetch OGP data for that URL." };
    await updateLink(env.DB, id, {
      title: ogp.title ?? link.title,
      description: ogp.description ?? link.description,
      ogImageUrl: ogp.image ?? link.ogImageUrl,
    });
    return { success: "OGP data fetched." };
  }

  if (intent === "setTags") {
    const ids = form
      .getAll("tagId")
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n > 0);
    await setLinkTags(env.DB, id, ids);
    return { success: "Tags updated." };
  }

  if (intent === "createTag") {
    const name = String(form.get("name") ?? "").trim();
    const color = String(form.get("color") ?? "").trim() || null;
    if (!name) return { error: "Tag name required." };
    const result = await createTag(env.DB, { name, color, ownerUserId: user.id });
    if (!result.ok) return { error: `Tag "${name}" already exists.` };
    return { success: `Tag "${name}" created.` };
  }

  if (intent === "addPermission") {
    const principalType = String(form.get("principalType") ?? "");
    const principalId = String(form.get("principalId") ?? "").trim();
    const role = String(form.get("role") ?? "");
    if (principalType !== "user" && principalType !== "chapter") {
      return { error: "Invalid principal type." };
    }
    if (role !== "editor" && role !== "viewer") return { error: "Invalid role." };
    if (!principalId) return { error: "Principal id required." };
    if (principalType === "user" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(principalId)) {
      return { error: "Invalid email address." };
    }
    if (principalType === "chapter" && !/^\d+$/.test(principalId)) {
      return { error: "Chapter id must be a number." };
    }
    const result = await addPermission(env.DB, {
      linkId: id,
      principalType,
      principalId,
      role,
    });
    if (!result.ok) return { error: "That principal already has access to this link." };
    return { success: "Permission added." };
  }

  if (intent === "removePermission") {
    const permId = Number(form.get("permissionId"));
    if (!Number.isInteger(permId) || permId <= 0) return { error: "Invalid permission id." };
    await removePermission(env.DB, permId);
    return null;
  }

  if (intent === "updatePermissionRole") {
    const permId = Number(form.get("permissionId"));
    const role = String(form.get("role") ?? "");
    if (!Number.isInteger(permId) || permId <= 0) return { error: "Invalid permission id." };
    if (role !== "editor" && role !== "viewer") return { error: "Invalid role." };
    await updatePermissionRole(env.DB, permId, role);
    return null;
  }

  return { error: "Unknown action." };
}

function userLabel(users: Record<string, UserSummary>, id: string) {
  const u = users[id];
  if (!u) return id;
  return u.name || u.email || id;
}

function PermissionRow({
  permission,
  editable,
}: {
  permission: LinkPermission;
  editable: boolean;
}) {
  return (
    <div className="flex items-center gap-3 border-b last:border-b-0 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{permission.principalId}</p>
        <p className="text-xs text-muted-foreground capitalize">{permission.principalType}</p>
      </div>
      {editable ? (
        <>
          <Form method="post" className="flex items-center gap-2">
            <input type="hidden" name="intent" value="updatePermissionRole" />
            <input type="hidden" name="permissionId" value={permission.id} />
            <Select name="role" defaultValue={permission.role}>
              <SelectTrigger className="w-[110px] h-8" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" variant="ghost" size="sm">
              Save
            </Button>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="removePermission" />
            <input type="hidden" name="permissionId" value={permission.id} />
            <Button type="submit" variant="ghost" size="icon-sm" aria-label="Remove">
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </Form>
        </>
      ) : (
        <Badge variant="secondary">{permission.role}</Badge>
      )}
    </div>
  );
}

export default function EditLink({ loaderData, actionData }: Route.ComponentProps) {
  const {
    link,
    tags,
    availableTags,
    comments,
    users,
    permissions,
    editable,
    appUrl,
    shortUrlBase,
  } = loaderData;
  const tagIds = new Set(tags.map((t) => t.id));
  const shortUrl = `${appUrl}/${link.slug}`;
  const apexShortUrl = `${shortUrlBase}/${link.slug}`;

  return (
    <PageShell>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground">
        <Link to="/dashboard">
          <ArrowLeft className="size-4" /> Back to dashboard
        </Link>
      </Button>

      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-medium tracking-tight">
          {editable ? "Edit link" : "View link"}
        </h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={`/links/${link.id}/analytics`}>
              <BarChart3 className="size-4" />
              Analytics
            </Link>
          </Button>
          {editable ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Delete link">
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete "{link.slug}"?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove the short link.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <Form method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <AlertDialogAction type="submit" className="bg-destructive">
                      Delete
                    </AlertDialogAction>
                  </Form>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        Short URL: <span className="font-mono text-gdg-blue">{apexShortUrl}</span>
      </p>

      {actionData?.error ? (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{actionData.error}</AlertDescription>
        </Alert>
      ) : null}
      {actionData?.success ? (
        <Alert className="mt-4">
          <AlertTitle>Success</AlertTitle>
          <AlertDescription>{actionData.success}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Link details</CardTitle>
              {editable ? (
                <Form method="post">
                  <input type="hidden" name="intent" value="fetchOgp" />
                  <Button type="submit" variant="outline" size="sm">
                    <RefreshCw className="size-4" />
                    Fetch OGP
                  </Button>
                </Form>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            <Form method="post" className="grid gap-4">
              <input type="hidden" name="intent" value="update" />
              <div className="space-y-2">
                <Label htmlFor="destinationUrl">Destination URL</Label>
                <Input
                  id="destinationUrl"
                  name="destinationUrl"
                  type="url"
                  defaultValue={link.destinationUrl}
                  required
                  disabled={!editable}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  name="slug"
                  defaultValue={link.slug}
                  pattern="[a-zA-Z0-9_\-]{1,64}"
                  required
                  disabled={!editable}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  name="title"
                  defaultValue={link.title ?? ""}
                  disabled={!editable}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  defaultValue={link.description ?? ""}
                  disabled={!editable}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ogImageUrl">OG image URL</Label>
                <Input
                  id="ogImageUrl"
                  name="ogImageUrl"
                  type="url"
                  defaultValue={link.ogImageUrl ?? ""}
                  disabled={!editable}
                />
              </div>
              {link.ogImageUrl ? (
                <img
                  src={link.ogImageUrl}
                  alt="OGP preview"
                  className="rounded-md border max-h-48 object-contain"
                />
              ) : null}
              {editable ? (
                <Button type="submit" className="w-fit">
                  Save changes
                </Button>
              ) : null}
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>QR code</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <div className="rounded-md bg-white p-4">
              <QRCodeSVG value={apexShortUrl} size={160} />
            </div>
            <p className="text-xs text-muted-foreground font-mono break-all text-center">
              {apexShortUrl}
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tags</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {tags.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tags yet.</p>
              ) : (
                tags.map((tag) => (
                  <Badge
                    key={tag.id}
                    style={tag.color ? { backgroundColor: tag.color } : undefined}
                  >
                    {tag.name}
                  </Badge>
                ))
              )}
            </div>
            {editable && availableTags.length > 0 ? (
              <Form method="post" className="space-y-3">
                <input type="hidden" name="intent" value="setTags" />
                <fieldset className="grid gap-2">
                  <legend className="text-sm font-medium mb-1">Available</legend>
                  {availableTags.map((tag) => (
                    <label key={tag.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="tagId"
                        value={tag.id}
                        defaultChecked={tagIds.has(tag.id)}
                      />
                      <Badge style={tag.color ? { backgroundColor: tag.color } : undefined}>
                        {tag.name}
                      </Badge>
                    </label>
                  ))}
                </fieldset>
                <Button type="submit" size="sm">
                  Apply tags
                </Button>
              </Form>
            ) : null}
            {editable ? (
              <Form method="post" className="grid gap-2 sm:grid-cols-3 border-t pt-4">
                <input type="hidden" name="intent" value="createTag" />
                <Input name="name" placeholder="New tag name" maxLength={32} required />
                <Input name="color" type="color" defaultValue="#4285F4" />
                <Button type="submit" size="sm">
                  Create tag
                </Button>
              </Form>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sharing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {permissions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not shared with anyone.</p>
            ) : (
              permissions.map((perm) => (
                <PermissionRow key={perm.id} permission={perm} editable={editable} />
              ))
            )}
            {editable ? (
              <Form method="post" className="grid gap-2 border-t pt-4">
                <input type="hidden" name="intent" value="addPermission" />
                <Select name="principalType" defaultValue="user">
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Email</SelectItem>
                    <SelectItem value="chapter">Chapter id</SelectItem>
                  </SelectContent>
                </Select>
                <Input name="principalId" placeholder="alice@example.com or 1" required />
                <Select name="role" defaultValue="viewer">
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="submit" size="sm">
                  Share
                </Button>
              </Form>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Comments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {comments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No comments yet.</p>
            ) : (
              <div className="space-y-3">
                {comments.map((comment) => (
                  <div key={comment.id} className="border rounded-md p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium">
                        {userLabel(users, comment.authorUserId)}
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground">
                          {new Date(comment.createdAt * 1000).toLocaleString()}
                        </p>
                        {editable ? (
                          <Form method="post">
                            <input type="hidden" name="intent" value="deleteComment" />
                            <input type="hidden" name="commentId" value={comment.id} />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Delete comment"
                            >
                              <Trash2 className="size-3 text-destructive" />
                            </Button>
                          </Form>
                        ) : null}
                      </div>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{comment.body}</p>
                  </div>
                ))}
              </div>
            )}
            <Form method="post" className="space-y-2">
              <input type="hidden" name="intent" value="addComment" />
              <Textarea name="body" placeholder="Leave a comment…" required maxLength={2000} />
              <Button type="submit" size="sm">
                Post comment
              </Button>
            </Form>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
