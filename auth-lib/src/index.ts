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
