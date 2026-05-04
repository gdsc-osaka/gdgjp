export type UserChapter = {
  chapterId: number;
  chapterSlug: string;
  role: "organizer" | "member";
};

const CACHE_TTL_MS = 30_000;
const FETCH_TIMEOUT_MS = 5_000;
const cache = new Map<string, { value: UserChapter; expiresAt: number }>();

export async function fetchChapterForUser(
  env: Env,
  tinyurlUserId: string,
): Promise<UserChapter | null> {
  const accountId = await getLinkedAccountId(env.DB, tinyurlUserId);
  if (!accountId) return null;

  const now = Date.now();
  const cached = cache.get(accountId);
  if (cached) {
    if (cached.expiresAt > now) return cached.value;
    cache.delete(accountId);
  }

  if (!env.INTERNAL_API_SECRET) {
    throw new Error("missing INTERNAL_API_SECRET");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${env.IDP_URL}/api/internal/chapter`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId: accountId }),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`chapter lookup timed out after ${FETCH_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`chapter lookup failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { chapter: UserChapter | null };
  const value = data.chapter ?? null;
  if (value) cache.set(accountId, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

async function getLinkedAccountId(db: D1Database, userId: string): Promise<string | null> {
  const row = await db
    .prepare(`SELECT accountId FROM account WHERE userId = ? AND providerId = 'gdgjp' LIMIT 1`)
    .bind(userId)
    .first<{ accountId: string }>();
  return row?.accountId ?? null;
}
