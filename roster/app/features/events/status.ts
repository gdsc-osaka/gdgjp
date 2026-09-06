/**
 * Event status lifecycle (docs/roster/index.md §3 "イベントのステータス").
 *
 * Transitions are unrestricted in both directions — an owner can re-open a
 * `closed` event, or roll a `published` one back to `draft` — so there is no
 * transition table here, only the two predicates that actually gate
 * behavior: `canApply` decides whether `/apply/:applyToken` (Stage 04)
 * accepts registrations, `canView` decides whether `/r/:viewToken`
 * (Stage 09) serves the published schedule. Keep these as the only two
 * status-shaped decisions in the app — anything else branching on `status`
 * directly is a sign the check belongs here instead.
 */

export const STATUSES = ["draft", "open", "closed", "published", "ended"] as const;

export type EventStatus = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<EventStatus, string> = {
  draft: "下書き",
  open: "募集中",
  closed: "締切",
  published: "公開",
  ended: "終了",
};

export function isEventStatus(value: string): value is EventStatus {
  return (STATUSES as readonly string[]).includes(value);
}

/** Does `/apply/:applyToken` accept staff registrations for an event in this status? */
export function canApply(status: EventStatus): boolean {
  return status === "open";
}

/** Is the public read-only schedule at `/r/:viewToken` visible for this status? */
export function canView(status: EventStatus): boolean {
  return status === "published";
}
