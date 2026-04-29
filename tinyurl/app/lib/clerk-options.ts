import type { AuthOptions } from "@gdgjp/auth-lib";

export function clerkAuthOptions(env: Env): AuthOptions {
  return {
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    secretKey: env.CLERK_SECRET_KEY,
    isSatellite: true,
    domain: new URL(env.APP_URL).host,
    signInUrl: `${env.ACCOUNTS_URL}/signin`,
    authorizedParties: [env.APP_URL, env.ACCOUNTS_URL],
  };
}
