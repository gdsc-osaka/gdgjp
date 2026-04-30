import { getUserChapter, requireUser } from "@gdgjp/auth-lib";
import { Copy, ExternalLink, Plus, Tag as TagIcon } from "lucide-react";
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
import { type Link as DbLink, listLinksAccessibleByEmail, listLinksForUser } from "~/lib/db";
import type { Route } from "./+types/dashboard";

export function meta() {
  return [{ title: "Dashboard — GDG Japan Links" }];
}

export async function loader(args: Route.LoaderArgs) {
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
  const [ownLinks, sharedLinks] = await Promise.all([
    listLinksForUser(env.DB, user.id),
    listLinksAccessibleByEmail(env.DB, user.email, chapter?.chapterId ?? null),
  ]);
  const ownIds = new Set(ownLinks.map((l) => l.id));
  const sharedFiltered = sharedLinks.filter((l) => !ownIds.has(l.id));
  return { user, chapter, ownLinks, sharedLinks: sharedFiltered };
}

function LinkTable({
  links,
  appUrl,
  showOwner,
}: {
  links: DbLink[];
  appUrl: string;
  showOwner?: boolean;
}) {
  async function copyApex(slug: string) {
    await navigator.clipboard.writeText(`https://gdgs.jp/${slug}`);
    toast.success("Copied to clipboard");
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Slug</TableHead>
          <TableHead>Destination</TableHead>
          <TableHead>Title</TableHead>
          {showOwner ? <TableHead>Owner</TableHead> : null}
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {links.map((link) => (
          <TableRow key={link.id}>
            <TableCell className="font-mono text-sm">
              <button
                type="button"
                onClick={() => copyApex(link.slug)}
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
            <TableCell className="text-sm text-muted-foreground">{link.title ?? "—"}</TableCell>
            {showOwner ? (
              <TableCell className="text-xs text-muted-foreground font-mono">
                {link.ownerChapterId ? `chapter:${link.ownerChapterId}` : "user"}
              </TableCell>
            ) : null}
            <TableCell className="text-right">
              <Button asChild variant="outline" size="sm">
                <Link to={`/links/${link.id}`}>Open</Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { user, ownLinks, sharedLinks } = loaderData;
  const appUrl = "https://url.gdgs.jp";

  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-medium tracking-tight">Your links</h1>
          <p className="text-sm text-muted-foreground">Signed in as {user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/tags">
              <TagIcon className="size-4" />
              Tags
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/links/new">
              <Plus className="size-4" />
              New link
            </Link>
          </Button>
        </div>
      </div>

      <Card className="mt-6">
        {ownLinks.length === 0 ? (
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
          <LinkTable links={ownLinks} appUrl={appUrl} />
        )}
      </Card>

      {sharedLinks.length > 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Shared with me</CardTitle>
            <CardDescription>Links shared with your email or chapter.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <LinkTable links={sharedLinks} appUrl={appUrl} showOwner />
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  );
}
