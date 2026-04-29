import { requireUser } from "@gdgjp/auth-lib";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Link, redirect } from "react-router";
import { PageShell } from "~/components/page-shell";
import { StatusBadge } from "~/components/status-badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { getMembership } from "~/lib/db";
import type { Route } from "./+types/dashboard";

export function meta() {
  return [{ title: "Dashboard — GDG Japan Accounts" }];
}

export async function loader(args: Route.LoaderArgs) {
  const env = args.context.cloudflare.env;
  try {
    const user = await requireUser(args.request, {
      publishableKey: env.CLERK_PUBLISHABLE_KEY,
      secretKey: env.CLERK_SECRET_KEY,
    });
    const membership = await getMembership(env.DB, user.id);
    return { user, membership };
  } catch {
    throw redirect("/sign-in");
  }
}

function MembershipPanel({
  membership,
}: { membership: Route.ComponentProps["loaderData"]["membership"] }) {
  if (!membership) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No chapter yet</CardTitle>
          <CardDescription>
            Pick a GDG or GDGoC chapter to request membership. An organizer will approve your
            request.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/onboarding">
              Choose your chapter <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (membership.status === "pending") {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{membership.chapter.name}</CardTitle>
            <StatusBadge status="pending">Pending approval</StatusBadge>
          </div>
          <CardDescription>
            An organizer will review your request soon. You'll get full access once approved.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const isOrganizer = membership.role === "organizer";
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{membership.chapter.name}</CardTitle>
          <StatusBadge status={isOrganizer ? "organizer" : "active"}>
            {isOrganizer ? "Organizer" : "Member"}
          </StatusBadge>
        </div>
        <CardDescription>
          {isOrganizer
            ? "You can review pending requests and manage members."
            : "You're an active member of this chapter."}
        </CardDescription>
      </CardHeader>
      {isOrganizer ? (
        <CardContent>
          <Button asChild>
            <Link to={`/chapters/${membership.chapter.slug}/organize`}>
              Organize chapter <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { user, membership } = loaderData;
  return (
    <PageShell>
      <div className="space-y-1">
        <h1 className="text-3xl font-medium tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Signed in as {user.email}</p>
      </div>
      <div className="mt-6">
        <MembershipPanel membership={membership} />
      </div>
      {user.isAdmin ? (
        <Card className="mt-6 border-gdg-blue/30 bg-gdg-blue/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-gdg-blue" />
              <CardTitle className="text-base">Super admin tools</CardTitle>
            </div>
            <CardDescription>Create, edit, or delete chapters across GDG Japan.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/admin/chapters">Manage chapters</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  );
}
