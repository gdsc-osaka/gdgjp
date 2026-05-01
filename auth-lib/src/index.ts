import { createClerkClient } from "@clerk/backend";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
};

export function isSuperAdmin(user: AuthUser): boolean {
  return user.isAdmin;
}

export type AuthOptions = {
  publishableKey: string;
  secretKey: string;
  signInUrl?: string;
  isSatellite?: boolean;
  domain?: string;
  authorizedParties?: string[];
};

export async function getAuth(request: Request, options: AuthOptions): Promise<AuthUser | null> {
  const client = createClerkClient({
    publishableKey: options.publishableKey,
    secretKey: options.secretKey,
  });
  const requestState = await client.authenticateRequest(request, {
    publishableKey: options.publishableKey,
    secretKey: options.secretKey,
    signInUrl: options.signInUrl,
    isSatellite: options.isSatellite,
    domain: options.domain,
    authorizedParties: options.authorizedParties,
  });
  if (!requestState.isAuthenticated) return null;
  const auth = requestState.toAuth();
  if (!auth?.userId) return null;
  const user = await client.users.getUser(auth.userId);
  const primaryEmail =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ?? "";
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "";
  const isAdmin = (user.publicMetadata as { isAdmin?: unknown } | null)?.isAdmin === true;
  return { id: user.id, email: primaryEmail, name, isAdmin };
}

export async function requireUser(request: Request, options: AuthOptions): Promise<AuthUser> {
  const user = await getAuth(request, options);
  if (!user) throw new Response("Unauthorized", { status: 401 });
  return user;
}

export type UserSummary = { id: string; email: string; name: string };

export type UserChapter = {
  chapterId: number;
  chapterSlug: string;
  role: "organizer" | "member";
};

export async function setUserChapter(
  userId: string,
  chapter: UserChapter | null,
  options: Pick<AuthOptions, "publishableKey" | "secretKey">,
): Promise<void> {
  const client = createClerkClient({
    publishableKey: options.publishableKey,
    secretKey: options.secretKey,
  });
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { chapter },
  });
}

export async function getUserChapter(
  userId: string,
  options: Pick<AuthOptions, "publishableKey" | "secretKey">,
): Promise<UserChapter | null> {
  const client = createClerkClient({
    publishableKey: options.publishableKey,
    secretKey: options.secretKey,
  });
  const user = await client.users.getUser(userId);
  const chapter = (user.publicMetadata as { chapter?: unknown } | null)?.chapter;
  if (!chapter || typeof chapter !== "object") return null;
  const c = chapter as { chapterId?: unknown; chapterSlug?: unknown; role?: unknown };
  if (
    !Number.isInteger(c.chapterId) ||
    (c.chapterId as number) <= 0 ||
    !Number.isFinite(c.chapterId as number) ||
    typeof c.chapterSlug !== "string" ||
    (c.role !== "organizer" && c.role !== "member")
  ) {
    return null;
  }
  return { chapterId: c.chapterId, chapterSlug: c.chapterSlug, role: c.role };
}

export async function getUsersByIds(
  ids: string[],
  options: Pick<AuthOptions, "publishableKey" | "secretKey">,
): Promise<Record<string, UserSummary>> {
  if (ids.length === 0) return {};
  const client = createClerkClient({
    publishableKey: options.publishableKey,
    secretKey: options.secretKey,
  });
  const { data } = await client.users.getUserList({ userId: ids, limit: ids.length });
  const out: Record<string, UserSummary> = {};
  for (const user of data) {
    const primaryEmail =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ?? "";
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "";
    out[user.id] = { id: user.id, email: primaryEmail, name };
  }
  return out;
}
