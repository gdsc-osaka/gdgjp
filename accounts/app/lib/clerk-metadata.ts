import { setUserChapter } from "@gdgjp/auth-lib";
import { getMembership } from "./db";

export async function syncMembershipMetadata(
  userId: string,
  env: { DB: D1Database; CLERK_PUBLISHABLE_KEY: string; CLERK_SECRET_KEY: string },
): Promise<void> {
  const membership = await getMembership(env.DB, userId);
  const chapter =
    membership && membership.status === "active"
      ? {
          chapterId: membership.chapter.id,
          chapterSlug: membership.chapter.slug,
          role: membership.role,
        }
      : null;
  await setUserChapter(userId, chapter, {
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    secretKey: env.CLERK_SECRET_KEY,
  });
}
