import { type AuthInstance, initializeAuth } from "@gdgjp/auth-lib/server";

let cached: { instance: AuthInstance; env: Env } | null = null;

export function getAuth(env: Env): AuthInstance {
  if (cached?.env === env) return cached.instance;
  const instance = initializeAuth({
    db: env.DB,
    appUrl: env.APP_URL,
    cookiePrefix: "gdgjp-tinyurl",
    secret: env.BETTER_AUTH_SECRET,
    idp: {
      url: env.IDP_URL,
      clientId: env.IDP_CLIENT_ID,
      clientSecret: env.IDP_CLIENT_SECRET,
    },
  });
  cached = { instance, env };
  return instance;
}
