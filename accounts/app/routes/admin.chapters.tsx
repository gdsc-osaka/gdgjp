import { requireUser } from "@gdgjp/auth-lib";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Form, Link } from "react-router";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { buildSignInRedirect } from "~/lib/auth-redirect";
import { type ChapterKind, createChapter, deleteChapter, listChapters } from "~/lib/db";
import { requireSuperAdmin } from "~/lib/permissions";
import type { Route } from "./+types/admin.chapters";

export function meta() {
  return [{ title: "Manage chapters — GDG Japan Accounts" }];
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
    throw buildSignInRedirect(args.request);
  }
  requireSuperAdmin(user);
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
    throw buildSignInRedirect(args.request);
  }
  requireSuperAdmin(user);
  const form = await args.request.formData();
  const intent = form.get("intent");
  if (intent === "delete") {
    const id = Number(form.get("id"));
    if (Number.isInteger(id) && id > 0) {
      await deleteChapter(env.DB, id);
    }
    return null;
  }
  if (intent === "create") {
    const slug = String(form.get("slug") ?? "").trim();
    const name = String(form.get("name") ?? "").trim();
    const kind = String(form.get("kind") ?? "") as ChapterKind;
    if (!slug || !name || (kind !== "gdg" && kind !== "gdgoc")) {
      return { error: "All fields are required." };
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return { error: "Slug must be lowercase letters, numbers, and dashes." };
    }
    try {
      await createChapter(env.DB, { slug, name, kind });
    } catch {
      return { error: "Could not create chapter (slug may already exist)." };
    }
    return null;
  }
  return { error: "Unknown action." };
}

export default function AdminChapters({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <PageShell>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground">
        <Link to="/dashboard">
          <ArrowLeft className="size-4" /> Back to dashboard
        </Link>
      </Button>

      <h1 className="text-3xl font-medium tracking-tight">Manage chapters</h1>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Create a chapter</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="grid gap-4 sm:grid-cols-3">
            <input type="hidden" name="intent" value="create" />
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input id="slug" name="slug" placeholder="gdg-tokyo" pattern="[a-z0-9-]+" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="GDG Tokyo" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kind">Kind</Label>
              <Select name="kind" defaultValue="gdg">
                <SelectTrigger id="kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gdg">GDG</SelectItem>
                  <SelectItem value="gdgoc">GDGoC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-3">
              <Button type="submit">Create chapter</Button>
            </div>
            {actionData?.error ? (
              <div className="sm:col-span-3">
                <Alert variant="destructive">
                  <AlertTitle>Couldn't save</AlertTitle>
                  <AlertDescription>{actionData.error}</AlertDescription>
                </Alert>
              </div>
            ) : null}
          </Form>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Existing chapters</CardTitle>
        </CardHeader>
        <CardContent>
          {loaderData.chapters.length === 0 ? (
            <p className="text-sm text-muted-foreground">No chapters yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loaderData.chapters.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {c.slug}
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          c.kind === "gdg"
                            ? "font-mono text-xs text-gdg-blue"
                            : "font-mono text-xs text-gdg-green"
                        }
                      >
                        {c.kind === "gdg" ? "GDG" : "GDGoC"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link to={`/chapters/${c.slug}/organize`}>Organize</Link>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`Delete ${c.name}`}>
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {c.name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Members will lose their membership. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <Form method="post">
                                <input type="hidden" name="intent" value="delete" />
                                <input type="hidden" name="id" value={c.id} />
                                <AlertDialogAction type="submit" className="bg-destructive">
                                  Delete chapter
                                </AlertDialogAction>
                              </Form>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
