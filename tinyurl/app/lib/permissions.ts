import type { AuthUser } from "@gdgjp/auth-lib";
import { isSuperAdmin } from "@gdgjp/auth-lib";
import type { Link, LinkPermission, LinkRole } from "./db";

export function requireSuperAdmin(user: AuthUser): void {
  if (!isSuperAdmin(user)) {
    throw new Response("Forbidden", { status: 403 });
  }
}

export type ViewerContext = {
  user: AuthUser;
  chapterId: number | null;
};

function matchingRole(ctx: ViewerContext, permissions: LinkPermission[]): LinkRole | null {
  let best: LinkRole | null = null;
  for (const p of permissions) {
    if (
      (p.principalType === "user" && p.principalId === ctx.user.email) ||
      (p.principalType === "chapter" &&
        ctx.chapterId !== null &&
        p.principalId === String(ctx.chapterId))
    ) {
      if (p.role === "editor") return "editor";
      if (p.role === "viewer") best = "viewer";
    }
  }
  return best;
}

export function canViewLink(
  ctx: ViewerContext,
  link: Link,
  permissions: LinkPermission[],
): boolean {
  if (link.ownerUserId === ctx.user.id) return true;
  if (isSuperAdmin(ctx.user)) return true;
  if (link.ownerChapterId !== null && ctx.chapterId === link.ownerChapterId) return true;
  return matchingRole(ctx, permissions) !== null;
}

export function canEditLink(
  ctx: ViewerContext,
  link: Link,
  permissions: LinkPermission[],
): boolean {
  if (link.ownerUserId === ctx.user.id) return true;
  if (isSuperAdmin(ctx.user)) return true;
  return matchingRole(ctx, permissions) === "editor";
}

export function requireCanView(
  ctx: ViewerContext,
  link: Link,
  permissions: LinkPermission[],
): void {
  if (!canViewLink(ctx, link, permissions)) {
    throw new Response("Forbidden", { status: 403 });
  }
}

export function requireCanEdit(
  ctx: ViewerContext,
  link: Link,
  permissions: LinkPermission[],
): void {
  if (!canEditLink(ctx, link, permissions)) {
    throw new Response("Forbidden", { status: 403 });
  }
}
