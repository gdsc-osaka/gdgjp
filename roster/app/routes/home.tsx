import { Link } from "react-router";
import { requireUserWithChapter } from "~/features/auth/auth-redirect.server";
import { EventCard } from "~/features/events/components/EventCard";
import { listEventsForChapters } from "~/features/events/events.server";
import { getDb } from "~/lib/db.server";
import type { Route } from "./+types/home";

export function meta() {
  return [{ title: "roster イベント一覧" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const { user, chapters } = await requireUserWithChapter(env, request);
  const events = await listEventsForChapters(
    getDb(env),
    chapters.map((c) => c.chapterId),
  );
  return { user: { name: user.name, email: user.email }, events };
}

/** イベント一覧 (docs/roster/02-domain-schema.md "Design" §6, screen `/`). */
export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { user, events } = loaderData;
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-6 lg:p-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">roster イベント</h1>
          <p className="text-sm text-neutral-600">{user.name} さん</p>
        </div>
        <Link
          to="/events/new"
          className="rounded-full border-2 border-black bg-gdg-blue px-6 py-2.5 font-bold text-white transition hover:brightness-95"
        >
          イベントを作成
        </Link>
      </div>

      {events.length === 0 ? (
        <p className="text-neutral-600">まだイベントがありません。</p>
      ) : (
        <ul className="space-y-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </ul>
      )}
    </main>
  );
}
