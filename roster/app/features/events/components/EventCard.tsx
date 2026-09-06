import { Link } from "react-router";
import type { EventRecord } from "~/features/events/events.server";
import { STATUS_LABELS } from "~/features/events/status";

const STATUS_BADGE_COLOR: Record<EventRecord["status"], string> = {
  draft: "bg-neutral-200 text-neutral-700",
  open: "bg-gdg-green/20 text-gdg-green",
  closed: "bg-gdg-yellow/20 text-neutral-800",
  published: "bg-gdg-blue/20 text-gdg-blue",
  ended: "bg-neutral-200 text-neutral-500",
};

/** One event's summary row in the `/` list (docs/roster/02-domain-schema.md "Design" §6). */
export function EventCard({ event }: { event: EventRecord }) {
  return (
    <li className="rounded-2xl border-2 border-black bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to={`/e/${event.id}/design`} className="text-lg font-bold text-gdg-blue underline">
          {event.name}
        </Link>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_BADGE_COLOR[event.status]}`}
        >
          {STATUS_LABELS[event.status]}
        </span>
      </div>
      <p className="mt-1 text-sm text-neutral-600">
        {event.date} {event.startTime}–{event.endTime}
      </p>
    </li>
  );
}
