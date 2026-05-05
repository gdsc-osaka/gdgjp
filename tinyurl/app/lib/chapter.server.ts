import { ClaimsUnavailableError, type UserChapter } from "@gdgjp/gdg-lib";
import { getAuth } from "~/lib/auth.server";

export type { UserChapter };
export { ClaimsUnavailableError };

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { value: UserChapter | null; expiresAt: number }>();

export async function fetchChapterForUser(
  env: Env,
  tinyurlUserId: string,
): Promise<UserChapter | null> {
  const now = Date.now();
  const hit = cache.get(tinyurlUserId);
  if (hit && hit.expiresAt > now) return hit.value;

  const claims = await getAuth(env).getFreshClaims(tinyurlUserId);
  cache.set(tinyurlUserId, { value: claims.chapter, expiresAt: now + CACHE_TTL_MS });
  return claims.chapter;
}
