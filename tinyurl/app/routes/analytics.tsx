import { getUserChapter, requireUser } from "@gdgjp/auth-lib";
import { ArrowLeft } from "lucide-react";
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
import { listLinksAccessibleByEmail, listLinksForUser } from "~/lib/db";
import type { Route } from "./+types/analytics";

export function meta() {
  return [{ title: "Analytics — GDG Japan Links" }];
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
  const [own, shared] = await Promise.all([
    listLinksForUser(env.DB, user.id),
    listLinksAccessibleByEmail(env.DB, user.email, chapter?.chapterId ?? null),
  ]);
  const idSet = new Set<number>([...own.map((l) => l.id), ...shared.map((l) => l.id)]);
  const ids = [...idSet];

  if (ids.length === 0) {
    return {
      hasLinks: false as const,
      hourly: [],
      total: 0,
      slugs: [],
      referrers: [],
      countries: [],
      regions: [],
      cities: [],
      browsers: [],
      oses: [],
      devices: [],
    };
  }

  const [hourly, total, slugs, referrers, countries, regions, cities, browsers, oses, devices] =
    await Promise.all([
      hourlyClicks(env, ids).catch(() => []),
      totalClicks(env, ids).catch(() => 0),
      topByBlob(env, "slug", ids).catch(() => []),
      topByBlob(env, "referer", ids).catch(() => []),
      topByBlob(env, "country", ids).catch(() => []),
      topByBlob(env, "region", ids).catch(() => []),
      topByBlob(env, "city", ids).catch(() => []),
      topByBlob(env, "browser", ids).catch(() => []),
      topByBlob(env, "os", ids).catch(() => []),
      topByBlob(env, "device", ids).catch(() => []),
    ]);

  return {
    hasLinks: true as const,
    hourly,
    total,
    slugs,
    referrers,
    countries,
    regions,
    cities,
    browsers,
    oses,
    devices,
  };
}

export default function Analytics({ loaderData }: Route.ComponentProps) {
  const {
    hasLinks,
    hourly,
    total,
    slugs,
    referrers,
    countries,
    regions,
    cities,
    browsers,
    oses,
    devices,
  } = loaderData;

  return (
    <PageShell>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground">
        <Link to="/dashboard">
          <ArrowLeft className="size-4" /> Back to dashboard
        </Link>
      </Button>

      <div className="space-y-1">
        <h1 className="text-3xl font-medium tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Aggregate clicks across your links and links shared with you. Last 7 days. Updated every
          minute.
        </p>
      </div>

      {!hasLinks ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>No links yet</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm">
              <Link to="/links/new">Create a link</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <MetricCard title="Total clicks" value={total} />
            <MetricCard title="Top short links" value={slugs.length} />
            <MetricCard title="Unique countries" value={countries.length} />
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
                <CardTitle>Top short links</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList rows={slugs} />
              </CardContent>
            </Card>

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

            <Card>
              <CardHeader>
                <CardTitle>Devices</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList rows={devices} />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </PageShell>
  );
}
