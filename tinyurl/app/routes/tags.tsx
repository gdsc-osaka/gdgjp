import { getUserChapter, requireUser } from "@gdgjp/auth-lib";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Form, Link } from "react-router";
import { PageShell } from "~/components/page-shell";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
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
import { buildSignInRedirect } from "~/lib/auth-redirect";
import { clerkAuthOptions } from "~/lib/clerk-options";
import { type Tag, createTag, deleteTag, listTagsForChapter, listTagsForUser } from "~/lib/db";
import type { Route } from "./+types/tags";

export function meta() {
  return [{ title: "Tags — GDG Japan Links" }];
}

async function requireAuthAndChapter(args: Route.LoaderArgs | Route.ActionArgs) {
  const env = args.context.cloudflare.env;
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(args.request, clerkAuthOptions(env));
  } catch {
    throw buildSignInRedirect(args.request, env);
  }
  const chapter = await getUserChapter(user.id, {
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    secretKey: env.CLERK_SECRET_KEY,
  });
  return { env, user, chapter };
}

export async function loader(args: Route.LoaderArgs) {
  const { env, user, chapter } = await requireAuthAndChapter(args);
  const [userTags, chapterTags] = await Promise.all([
    listTagsForUser(env.DB, user.id),
    chapter ? listTagsForChapter(env.DB, chapter.chapterId) : Promise.resolve<Tag[]>([]),
  ]);
  return { userTags, chapterTags, chapter };
}

export async function action(args: Route.ActionArgs) {
  const { env, user, chapter } = await requireAuthAndChapter(args);
  const form = await args.request.formData();
  const intent = form.get("intent");

  if (intent === "delete") {
    const id = Number(form.get("id"));
    if (!Number.isInteger(id) || id <= 0) return { error: "Invalid tag id." };
    return deleteTag(env.DB, id).then(() => null);
  }

  if (intent === "create") {
    const name = String(form.get("name") ?? "").trim();
    const color = String(form.get("color") ?? "").trim() || null;
    const scope = String(form.get("scope") ?? "user");
    if (!name) return { error: "Name is required." };
    if (name.length > 32) return { error: "Name must be 32 characters or less." };

    if (scope === "chapter") {
      if (!chapter) return { error: "You are not in a chapter." };
      const result = await createTag(env.DB, {
        name,
        color,
        ownerChapterId: chapter.chapterId,
      });
      if (!result.ok) return { error: `Tag "${name}" already exists.` };
      return null;
    }
    const result = await createTag(env.DB, {
      name,
      color,
      ownerUserId: user.id,
    });
    if (!result.ok) return { error: `Tag "${name}" already exists.` };
    return null;
  }

  return { error: "Unknown action." };
}

function TagRow({ tag }: { tag: Tag }) {
  return (
    <div className="flex items-center justify-between border-b last:border-b-0 py-2">
      <Badge style={tag.color ? { backgroundColor: tag.color } : undefined}>{tag.name}</Badge>
      <Form method="post">
        <input type="hidden" name="intent" value="delete" />
        <input type="hidden" name="id" value={tag.id} />
        <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Delete ${tag.name}`}>
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </Form>
    </div>
  );
}

export default function Tags({ loaderData, actionData }: Route.ComponentProps) {
  const { userTags, chapterTags, chapter } = loaderData;
  return (
    <PageShell>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground">
        <Link to="/dashboard">
          <ArrowLeft className="size-4" /> Back to dashboard
        </Link>
      </Button>

      <h1 className="text-3xl font-medium tracking-tight">Tags</h1>

      <Card className="mt-6 max-w-lg">
        <CardHeader>
          <CardTitle>Create a tag</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="grid gap-4 sm:grid-cols-3">
            <input type="hidden" name="intent" value="create" />
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="campaign-2025" required maxLength={32} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="color">Color</Label>
              <Input id="color" name="color" type="color" defaultValue="#4285F4" />
            </div>
            <div className="space-y-2 sm:col-span-3">
              <Label htmlFor="scope">Scope</Label>
              <Select name="scope" defaultValue="user">
                <SelectTrigger id="scope" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">My tags</SelectItem>
                  {chapter ? (
                    <SelectItem value="chapter">Chapter tags ({chapter.chapterSlug})</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-3">
              <Button type="submit">Create tag</Button>
            </div>
            {actionData?.error ? (
              <div className="sm:col-span-3">
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{actionData.error}</AlertDescription>
                </Alert>
              </div>
            ) : null}
          </Form>
        </CardContent>
      </Card>

      <Card className="mt-6 max-w-lg">
        <CardHeader>
          <CardTitle>My tags</CardTitle>
        </CardHeader>
        <CardContent>
          {userTags.length === 0 ? (
            <p className="text-sm text-muted-foreground">No personal tags yet.</p>
          ) : (
            userTags.map((tag) => <TagRow key={tag.id} tag={tag} />)
          )}
        </CardContent>
      </Card>

      {chapter ? (
        <Card className="mt-6 max-w-lg">
          <CardHeader>
            <CardTitle>Chapter tags ({chapter.chapterSlug})</CardTitle>
          </CardHeader>
          <CardContent>
            {chapterTags.length === 0 ? (
              <p className="text-sm text-muted-foreground">No chapter tags yet.</p>
            ) : (
              chapterTags.map((tag) => <TagRow key={tag.id} tag={tag} />)
            )}
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  );
}
