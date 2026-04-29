import { createClerkClient } from "@clerk/backend";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

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
  return { id: user.id, email: primaryEmail, name };
}

export async function requireUser(request: Request, options: AuthOptions): Promise<AuthUser> {
  const user = await getAuth(request, options);
  if (!user) throw new Response("Unauthorized", { status: 401 });
  return user;
}
