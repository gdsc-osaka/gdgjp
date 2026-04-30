import { requireUser } from "@gdgjp/auth-lib";
import { ArrowLeft } from "lucide-react";
import { Form, Link, redirect } from "react-router";
import { PageShell } from "~/components/page-shell";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { buildSignInRedirect } from "~/lib/auth-redirect";
import { clerkAuthOptions } from "~/lib/clerk-options";
import { createLink } from "~/lib/db";
import { generateRandomSlug, validateSlug } from "~/lib/slug";
import type { Route } from "./+types/links.new";

export function meta() {
  return [{ title: "New link — GDG Japan Links" }];
}

async function requireAuth(args: Route.LoaderArgs | Route.ActionArgs) {
  const env = args.context.cloudflare.env;
  try {
    return { user: await requireUser(args.request, clerkAuthOptions(env)), env };
  } catch {
    throw buildSignInRedirect(args.request, env);
  }
}

export async function loader(args: Route.LoaderArgs) {
  await requireAuth(args);
  return {};
}

export async function action(args: Route.ActionArgs) {
  const { user, env } = await requireAuth(args);
  const form = await args.request.formData();
  const rawSlug = String(form.get("slug") ?? "").trim();
  const destinationUrl = String(form.get("destinationUrl") ?? "").trim();
  const title = String(form.get("title") ?? "").trim() || null;
  const description = String(form.get("description") ?? "").trim() || null;

  if (!destinationUrl) {
    return { error: "Destination URL is required." };
  }
  try {
    new URL(destinationUrl);
  } catch {
    return { error: "Destination URL is not a valid URL." };
  }

  let slug = rawSlug;

  if (!slug) {
    // Auto-generate with collision retry
    for (let attempt = 0; attempt < 5; attempt++) {
      slug = generateRandomSlug(8);
      const result = await createLink(env.DB, {
        slug,
        destinationUrl,
        title,
        description,
        ownerUserId: user.id,
      });
      if (result.ok) throw redirect(`/links/${result.link.id}`);
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
    ownerUserId: user.id,
  });
  if (!result.ok) {
    return { error: `The slug "${slug}" is already taken.` };
  }
  throw redirect(`/links/${result.link.id}`);
}

export default function NewLink({ actionData }: Route.ComponentProps) {
  return (
    <PageShell>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground">
        <Link to="/dashboard">
          <ArrowLeft className="size-4" /> Back to dashboard
        </Link>
      </Button>

      <h1 className="text-3xl font-medium tracking-tight">New link</h1>

      <Card className="mt-6 max-w-lg">
        <CardHeader>
          <CardTitle>Create a short link</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="destinationUrl">Destination URL</Label>
              <Input
                id="destinationUrl"
                name="destinationUrl"
                type="url"
                placeholder="https://example.com/some/long/path"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">
                Slug{" "}
                <span className="text-muted-foreground font-normal">
                  (leave blank to auto-generate)
                </span>
              </Label>
              <Input id="slug" name="slug" placeholder="my-link" pattern="[a-zA-Z0-9_\-]{1,64}" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">
                Title <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input id="title" name="title" placeholder="My awesome link" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input id="description" name="description" placeholder="A brief description" />
            </div>
            {actionData?.error ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{actionData.error}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" className="w-fit">
              Create link
            </Button>
          </Form>
        </CardContent>
      </Card>
    </PageShell>
  );
}
