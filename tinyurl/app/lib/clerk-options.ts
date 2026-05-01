import type { AuthOptions } from "@gdgjp/auth-lib";

export function clerkAuthOptions(env: Env): AuthOptions {
  return {
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    secretKey: env.CLERK_SECRET_KEY,
    isSatellite: true,
    proxyUrl: env.CLERK_PROXY_URL,
    signInUrl: `${env.ACCOUNTS_URL}/signin`,
    authorizedParties: [env.APP_URL, env.ACCOUNTS_URL],
  };
}
