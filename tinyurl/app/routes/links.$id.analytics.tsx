import { getUserChapter, requireUser } from "@gdgjp/auth-lib";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Link } from "react-router";
import { BarList } from "~/components/charts/bar-list";
import { HourlyChart } from "~/components/charts/hourly-chart";
import { MetricCard } from "~/components/charts/metric-card";
import { PageShell } from "~/components/page-shell";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { hourlyClicks, topByBlob, totalClicks } from "~/lib/analytics-engine";
import { buildSignInRedirect } from "~/lib/auth-redirect";
import { clerkAuthOptions } from "~/lib/clerk-options";
import { getLinkById, listPermissionsForLink } from "~/lib/db";
import { type ViewerContext, canViewLink } from "~/lib/permissions";
import type { Route } from "./+types/links.$id.analytics";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: `${data?.link.slug ?? "Link"} analytics — GDG Japan Links` }];
}

export async function loader(args: Route.LoaderArgs) {
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

  const ids = [id];
  const [hourly, total, referrers, countries, regions, cities, browsers, oses, devices] =
    await Promise.all([
      hourlyClicks(env, ids).catch(() => []),
      totalClicks(env, ids).catch(() => 0),
      topByBlob(env, "referer", ids).catch(() => []),
      topByBlob(env, "country", ids).catch(() => []),
      topByBlob(env, "region", ids).catch(() => []),
      topByBlob(env, "city", ids).catch(() => []),
      topByBlob(env, "browser", ids).catch(() => []),
      topByBlob(env, "os", ids).catch(() => []),
      topByBlob(env, "device", ids).catch(() => []),
    ]);

  return {
    link,
    hourly,
    total,
    referrers,
    countries,
    regions,
    cities,
    browsers,
    oses,
    devices,
    shortUrlBase: env.SHORT_URL_BASE,
  };
}

export default function LinkAnalytics({ loaderData }: Route.ComponentProps) {
  const {
    link,
    hourly,
    total,
    referrers,
    countries,
    regions,
    cities,
    browsers,
    oses,
    devices,
    shortUrlBase,
  } = loaderData;
  const apexShortUrl = `${shortUrlBase}/${link.slug}`;

  return (
    <PageShell>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground">
        <Link to={`/links/${link.id}`}>
          <ArrowLeft className="size-4" /> Back to link
        </Link>
      </Button>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="space-y-1">
          <h1 className="text-3xl font-medium tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{apexShortUrl}</span>
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={link.destinationUrl} target="_blank" rel="noopener noreferrer">
            Visit destination
            <ExternalLink className="size-3" />
          </a>
        </Button>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">Last 7 days. Updated every minute.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <MetricCard title="Total clicks" value={total} hint="Last 7 days" />
        <MetricCard title="Unique countries" value={countries.length} />
        <MetricCard title="Unique referrers" value={referrers.length} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Hourly clicks</CardTitle>
        </CardHeader>
        <CardContent>
          <HourlyChart data={hourly} />
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top referrers</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={referrers} emptyLabel="No referrers yet." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top countries</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={countries} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top regions</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={regions} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top cities</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={cities} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Browsers</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={browsers} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operating systems</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={oses} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Devices</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={devices} />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
