import { requireUser } from "@gdgjp/auth-lib";
import { ArrowLeft, Trash2 } from "lucide-react";
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
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { buildSignInRedirect } from "~/lib/auth-redirect";
import { clerkAuthOptions } from "~/lib/clerk-options";
import { getLinkById, softDeleteLink, updateLink } from "~/lib/db";
import { validateSlug } from "~/lib/slug";
import type { Route } from "./+types/links.$id";

async function requireAuth(args: Route.LoaderArgs | Route.ActionArgs) {
  const env = args.context.cloudflare.env;
  try {
    return { user: await requireUser(args.request, clerkAuthOptions(env)), env };
  } catch {
    throw buildSignInRedirect(args.request, env);
  }
}

export async function loader(args: Route.LoaderArgs) {
  const { user, env } = await requireAuth(args);
  const id = Number(args.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new Response("Not found", { status: 404 });
  const link = await getLinkById(env.DB, id);
  if (!link || link.ownerUserId !== user.id) throw new Response("Not found", { status: 404 });
  return { link };
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `Edit ${data?.link.slug ?? "link"} — GDG Japan Links` }];
}

export async function action(args: Route.ActionArgs) {
  const { user, env } = await requireAuth(args);
  const id = Number(args.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new Response("Not found", { status: 404 });
  const link = await getLinkById(env.DB, id);
  if (!link || link.ownerUserId !== user.id) throw new Response("Not found", { status: 404 });

  const form = await args.request.formData();
  const intent = form.get("intent");

  if (intent === "delete") {
    await softDeleteLink(env.DB, id);
    throw redirect("/dashboard");
  }

  if (intent === "update") {
    const slug = String(form.get("slug") ?? "").trim();
    const destinationUrl = String(form.get("destinationUrl") ?? "").trim();
    const title = String(form.get("title") ?? "").trim() || null;
    const description = String(form.get("description") ?? "").trim() || null;

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
      await updateLink(env.DB, id, { slug, destinationUrl, title, description });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("UNIQUE")) return { error: `The slug "${slug}" is already taken.` };
      throw err;
    }
    return { success: true };
  }

  return { error: "Unknown action." };
}

export default function EditLink({ loaderData, actionData }: Route.ComponentProps) {
  const { link } = loaderData;
  return (
    <PageShell>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground">
        <Link to="/dashboard">
          <ArrowLeft className="size-4" /> Back to dashboard
        </Link>
      </Button>

      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-medium tracking-tight">Edit link</h1>
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
                This will permanently remove the short link. Existing URLs pointing to it will stop
                working.
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
      </div>

      <Card className="mt-6 max-w-lg">
        <CardHeader>
          <CardTitle>
            <span className="font-mono text-gdg-blue">gdgs.jp/{link.slug}</span>
          </CardTitle>
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
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">
                Title <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input id="title" name="title" defaultValue={link.title ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input id="description" name="description" defaultValue={link.description ?? ""} />
            </div>
            {actionData?.error ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{actionData.error}</AlertDescription>
              </Alert>
            ) : null}
            {actionData?.success ? (
              <Alert>
                <AlertTitle>Saved</AlertTitle>
                <AlertDescription>Your changes have been saved.</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" className="w-fit">
              Save changes
            </Button>
          </Form>
        </CardContent>
      </Card>
    </PageShell>
  );
}
