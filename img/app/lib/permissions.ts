import { type AuthUser, isSuperAdmin } from "@gdgjp/gdg-lib";
import type { ImageRow } from "~/lib/images";

export function canMutateImage(user: AuthUser, image: ImageRow): boolean {
  return image.userId === user.id || isSuperAdmin(user);
}
