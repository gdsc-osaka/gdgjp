export type AuthUser = {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
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

function mapToAuthUser(user: Record<string, unknown>): AuthUser {
  return {
    id: String(user.id ?? ""),
    email: String(user.email ?? ""),
    name: String(user.name ?? ""),
    isAdmin: user.isAdmin === true || user.isAdmin === 1,
  };
}
