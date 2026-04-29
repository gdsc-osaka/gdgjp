import type { AuthUser } from "@gdgjp/auth-lib";
import { isSuperAdmin } from "@gdgjp/auth-lib";

export function requireSuperAdmin(user: AuthUser): void {
  if (!isSuperAdmin(user)) {
    throw new Response("Forbidden", { status: 403 });
  }
}
