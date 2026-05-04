import type { AuthUser } from "@gdgjp/auth-lib";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { PageShell } from "~/components/page-shell";
import { StatusBadge } from "~/components/status-badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { buildSignInRedirect } from "~/lib/auth-redirect";
import { getAuth } from "~/lib/auth.server";
import { getMembership } from "~/lib/db";
import { i18n } from "~/lib/i18n/i18n.server";
import type { Route } from "./+types/dashboard";

export async function loader(args: Route.LoaderArgs) {
  const env = args.context.cloudflare.env;
  const t = await i18n.getFixedT(args.request);
  let user: AuthUser;
  try {
    user = await getAuth(env).requireUser(args.request);
  } catch (err) {
    if (err instanceof Response && err.status === 401) {
      throw buildSignInRedirect(args.request);
    }
    throw err;
  }
  const membership = await getMembership(env.DB, user.id);
  return { user, membership, title: t("meta.dashboard") };
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data?.title }];
}

function MembershipPanel({
  membership,
}: { membership: Route.ComponentProps["loaderData"]["membership"] }) {
  const { t } = useTranslation();
  if (!membership) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.noChapter.title")}</CardTitle>
          <CardDescription>{t("dashboard.noChapter.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/onboarding">
              {t("dashboard.noChapter.cta")} <ArrowRight className="size-4" />
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
            <StatusBadge status="pending">{t("dashboard.pending.badge")}</StatusBadge>
          </div>
          <CardDescription>{t("dashboard.pending.description")}</CardDescription>
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
            {isOrganizer ? t("dashboard.active.organizerBadge") : t("dashboard.active.memberBadge")}
          </StatusBadge>
        </div>
        <CardDescription>
          {isOrganizer ? t("dashboard.active.organizerDesc") : t("dashboard.active.memberDesc")}
        </CardDescription>
      </CardHeader>
      {isOrganizer ? (
        <CardContent>
          <Button asChild>
            <Link to={`/chapters/${membership.chapter.slug}/organize`}>
              {t("dashboard.active.organizeCta")} <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { user, membership } = loaderData;
  return (
    <PageShell user={user}>
      <div className="space-y-1">
        <h1 className="text-3xl font-medium tracking-tight">{t("dashboard.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("dashboard.signedInAs", { email: user.email })}
        </p>
      </div>
      <div className="mt-6">
        <MembershipPanel membership={membership} />
      </div>
      {user.isAdmin ? (
        <Card className="mt-6 border-gdg-blue/30 bg-gdg-blue/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-gdg-blue" />
              <CardTitle className="text-base">{t("dashboard.superAdmin.title")}</CardTitle>
            </div>
            <CardDescription>{t("dashboard.superAdmin.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/admin/chapters">{t("dashboard.superAdmin.cta")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  );
}
