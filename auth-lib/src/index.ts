export type AuthUser = {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
};

export type UserChapter = {
  chapterId: number;
  chapterSlug: string;
  role: "organizer" | "member";
};

export function isSuperAdmin(user: AuthUser): boolean {
  return user.isAdmin;
}

type SessionApi = {
  api: {
    getSession: (args: { headers: Headers }) => Promise<{
      user: Record<string, unknown>;
    } | null>;
  };
};

export async function getAuth(auth: SessionApi, request: Request): Promise<AuthUser | null> {
  const result = await auth.api.getSession({ headers: request.headers });
  if (!result?.user) return null;
  return mapToAuthUser(result.user);
}

export async function requireUser(auth: SessionApi, request: Request): Promise<AuthUser> {
  const user = await getAuth(auth, request);
  if (!user) throw new Response("Unauthorized", { status: 401 });
  return user;
}

export async function getUserChapter(
  auth: SessionApi,
  request: Request,
): Promise<UserChapter | null> {
  const result = await auth.api.getSession({ headers: request.headers });
  if (!result?.user) return null;
  return mapToChapter(result.user);
}

function mapToAuthUser(user: Record<string, unknown>): AuthUser {
  return {
    id: String(user.id ?? ""),
    email: String(user.email ?? ""),
    name: String(user.name ?? ""),
    isAdmin: user.isAdmin === true || user.isAdmin === 1,
  };
}

function mapToChapter(user: Record<string, unknown>): UserChapter | null {
  const chapterId = typeof user.chapterId === "number" ? user.chapterId : null;
  const chapterSlug = typeof user.chapterSlug === "string" ? user.chapterSlug : null;
  const role =
    user.chapterRole === "organizer" || user.chapterRole === "member"
      ? (user.chapterRole as "organizer" | "member")
      : null;
  if (chapterId === null || chapterSlug === null || role === null) return null;
  return { chapterId, chapterSlug, role };
}
