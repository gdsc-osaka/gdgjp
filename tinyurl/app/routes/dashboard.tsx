import { requireUser } from "@gdgjp/auth-lib";
import { Copy, ExternalLink, Plus } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { PageShell } from "~/components/page-shell";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { buildSignInRedirect } from "~/lib/auth-redirect";
import { clerkAuthOptions } from "~/lib/clerk-options";
import { listLinksForUser } from "~/lib/db";
import type { Route } from "./+types/dashboard";

export function meta() {
  return [{ title: "Dashboard — GDG Japan Links" }];
}

export async function loader(args: Route.LoaderArgs) {
  const env = args.context.cloudflare.env;
  try {
    const user = await requireUser(args.request, clerkAuthOptions(env));
    const links = await listLinksForUser(env.DB, user.id);
    return { user, links };
  } catch {
    throw buildSignInRedirect(args.request, env);
  }
}

function shortUrl(env: { APP_URL: string }, slug: string) {
  return `${env.APP_URL}/${slug}`;
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { user, links } = loaderData;

  async function copySlug(slug: string) {
    await navigator.clipboard.writeText(`https://gdgs.jp/${slug}`);
    toast.success("Copied to clipboard");
  }

  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-medium tracking-tight">Your links</h1>
          <p className="text-sm text-muted-foreground">Signed in as {user.email}</p>
        </div>
        <Button asChild size="sm">
          <Link to="/links/new">
            <Plus className="size-4" />
            New link
          </Link>
        </Button>
      </div>

      <Card className="mt-6">
        {links.length === 0 ? (
          <>
            <CardHeader>
              <CardTitle>No links yet</CardTitle>
              <CardDescription>Create your first short link to get started.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="sm" variant="outline">
                <Link to="/links/new">
                  <Plus className="size-4" />
                  Create a link
                </Link>
              </Button>
            </CardContent>
          </>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Slug</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map((link) => (
                <TableRow key={link.id}>
                  <TableCell className="font-mono text-sm">
                    <button
                      type="button"
                      onClick={() => copySlug(link.slug)}
                      className="flex items-center gap-1 hover:text-foreground text-muted-foreground"
                    >
                      {link.slug}
                      <Copy className="size-3" />
                    </button>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                    <a
                      href={link.destinationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-foreground"
                    >
                      {link.destinationUrl}
                      <ExternalLink className="size-3 shrink-0" />
                    </a>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {link.title ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/links/${link.id}`}>Edit</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </PageShell>
  );
}
