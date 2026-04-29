import { requireUser } from "@gdgjp/auth-lib";
import { Form, redirect } from "react-router";
import { PageShell } from "~/components/page-shell";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { getMembership, listChapters, requestMembership } from "~/lib/db";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/onboarding";

export function meta() {
  return [{ title: "Choose your chapter — GDG Japan Accounts" }];
}

export async function loader(args: Route.LoaderArgs) {
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
  const membership = await getMembership(env.DB, user.id);
  if (membership) throw redirect("/dashboard");
  const chapters = await listChapters(env.DB);
  return { chapters };
}

export async function action(args: Route.ActionArgs) {
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
  const form = await args.request.formData();
  const chapterId = Number(form.get("chapterId"));
  if (!Number.isInteger(chapterId) || chapterId <= 0) {
    return { error: "Please select a chapter." };
  }
  const result = await requestMembership(env.DB, user.id, chapterId);
  if (!result.ok) {
    return {
      error:
        result.reason === "chapter_not_found"
          ? "Chapter not found."
          : "You already have a chapter.",
    };
  }
  throw redirect("/dashboard");
}

export default function Onboarding({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <PageShell size="sm">
      <div className="space-y-1">
        <h1 className="text-3xl font-medium tracking-tight">Choose your chapter</h1>
        <p className="text-sm text-muted-foreground">
          Pick the GDG or GDGoC chapter you belong to. An organizer will approve your request.
        </p>
      </div>

      {loaderData.chapters.length === 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">No chapters yet</CardTitle>
            <CardDescription>
              No chapters are available yet. Please check back later.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Form method="post" className="mt-6 space-y-4">
          <fieldset className="space-y-2">
            <legend className="sr-only">Chapter</legend>
            {loaderData.chapters.map((c) => {
              const kindLabel = c.kind === "gdg" ? "GDG" : "GDGoC";
              const accent = c.kind === "gdg" ? "text-gdg-blue" : "text-gdg-green";
              return (
                <label
                  key={c.id}
                  className="group flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <input
                    type="radio"
                    name="chapterId"
                    value={c.id}
                    required
                    className="size-4 accent-primary"
                  />
                  <span className="flex flex-1 items-center justify-between gap-2">
                    <span className="font-medium">{c.name}</span>
                    <span className={cn("text-xs font-mono", accent)}>{kindLabel}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          {actionData?.error ? (
            <Alert variant="destructive">
              <AlertTitle>Couldn't request membership</AlertTitle>
              <AlertDescription>{actionData.error}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" className="w-full">
            Request membership
          </Button>
        </Form>
      )}
    </PageShell>
  );
}
