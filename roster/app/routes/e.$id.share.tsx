import { requireUserWithChapter } from "~/features/auth/auth-redirect.server";
import { canManageEvent } from "~/features/auth/permissions";
import { ShareCard } from "~/features/events/components/ShareCard";
import { getEvent } from "~/features/events/events.server";
import { getDb } from "~/lib/db.server";
import type { Route } from "./+types/e.$id.share";

/**
 * `/e/:id/share` (docs/roster/09-share-public-views.md "Design" §1):
 * chapter-gated exactly like `/e/:id/design`/`/e/:id/staff`/`/e/:id/roster`
 * — the same `requireUserWithChapter` + `canManageEvent` pattern every other
 * owner route in this app uses. This route does not change `status`; it
 * only surfaces the `/r/:viewToken` URL and what it does/doesn't expose
 * (`ShareCard`). Changing status to `published` happens on `/e/:id/design`
 * or `/e/:id/staff`, both of which already own that control.
 */
async function requireShareAccess(env: Env, request: Request, id: string | undefined) {
  const { chapters } = await requireUserWithChapter(env, request);
  if (!id) throw new Response(null, { status: 404 });
  const event = await getEvent(getDb(env), id);
  if (!event) throw new Response(null, { status: 404 });
  if (!canManageEvent(chapters, event)) throw new Response("Forbidden", { status: 403 });
  return { event };
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data ? `${data.event.name} — 共有 — roster` : "roster" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const { event } = await requireShareAccess(env, request, params.id);
  return {
    event: { id: event.id, name: event.name, status: event.status },
    viewUrl: `${env.APP_URL}/r/${event.viewToken}`,
  };
}

export default function SharePage({ loaderData }: Route.ComponentProps) {
  const { event, viewUrl } = loaderData;

  return (
    <main className="admin-page admin-page-narrow">
      <div className="page-heading">
        <div>
          <h1>共有</h1>
          <p>{event.name} · 閲覧専用URL</p>
        </div>
      </div>
      <ShareCard viewUrl={viewUrl} status={event.status} />
    </main>
  );
}
