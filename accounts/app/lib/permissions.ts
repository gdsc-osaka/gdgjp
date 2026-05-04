import type { AuthUser } from "@gdgjp/gdg-lib";
import { isSuperAdmin } from "@gdgjp/gdg-lib";
import type { Membership, MembershipWithChapter } from "./db";

export function canManageChapters(user: AuthUser): boolean {
  return isSuperAdmin(user);
}

export function canManageChapter(
  user: AuthUser,
  chapterId: number,
  membership: Membership | null,
): boolean {
  if (isSuperAdmin(user)) return true;
  return (
    membership !== null &&
    membership.chapterId === chapterId &&
    membership.role === "organizer" &&
    membership.status === "active"
  );
}

export function requireSuperAdmin(user: AuthUser): void {
  if (!canManageChapters(user)) {
    throw new Response("Forbidden", { status: 403 });
  }
}

export function requireOrganizerOf(
  user: AuthUser,
  chapterId: number,
  membership: MembershipWithChapter | null,
): void {
  if (!canManageChapter(user, chapterId, membership)) {
    throw new Response("Forbidden", { status: 403 });
  }
}
