import type { UserChapter } from "@gdgjp/gdg-lib";
import type { ApplicationRecord } from "~/features/applications/types";
import type { EventRecord } from "~/features/events/events.server";

/**
 * Single point of permission judgment for roster (docs/roster/index.md §6
 * "権限モデル（MVP はフラット）").
 *
 * MVP has exactly one rule: any signed-in member of the chapter that owns an
 * event — organizer or plain member, creator or not — may fully manage that
 * event. There is no per-user distinction within a chapter. Every future
 * authorization check should route through this module rather than comparing
 * `chapterId` inline, so that a future move to per-role RBAC only touches
 * this file.
 */

/** The subset of an event's fields permission checks need — derived from the
 * real `EventRecord` domain type (Stage 02) via `Pick` rather than a hand-
 * duplicated shape, so a future field rename here is caught by the compiler. */
export type PermissionEvent = Pick<EventRecord, "chapterId">;

/**
 * Can any of the caller's chapter memberships manage this event? True iff the
 * caller belongs to the chapter that owns the event — see the module doc
 * comment for why membership alone (not role) is sufficient in the MVP.
 */
export function canManageEvent(chapters: readonly UserChapter[], event: PermissionEvent): boolean {
  return chapters.some((chapter) => chapter.chapterId === event.chapterId);
}

/** The subset of an application's fields permission checks need. */
export type PermissionApplication = Pick<ApplicationRecord, "userId">;

/**
 * Can `viewer` edit this application (docs/roster/04-applications.md
 * "Design" §4 "権限")? Either the caller manages the owning event (any
 * chapter member, per `canManageEvent` — proxy-add, overwrite, reflecting a
 * withdrawal), or the application is the viewer's own. `viewer` is `null`
 * for an unauthenticated visitor, who can never edit anything here.
 */
export function canEditApplication(
  viewer: { userId: string } | null,
  chapters: readonly UserChapter[],
  event: PermissionEvent,
  application: PermissionApplication,
): boolean {
  if (canManageEvent(chapters, event)) return true;
  return viewer !== null && application.userId === viewer.userId;
}
