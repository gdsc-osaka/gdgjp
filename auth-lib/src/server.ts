import type { D1Database } from "@cloudflare/workers-types";
import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";
import { Kysely } from "kysely";
import { D1Dialect } from "kysely-d1";
import {
  type AuthUser,
  SSO_PROVIDER_ID,
  type SessionApi,
  getSessionUser as getSessionUserFromApi,
  requireUser as requireUserFromApi,
} from "./index";

export interface AuthServerEnv {
  DB: D1Database;
  APP_URL: string;
  BETTER_AUTH_SECRET: string;
  IDP_CLIENT_ID: string;
  IDP_CLIENT_SECRET: string;
  IDP_URL: string;
}

let cache: {
  auth: ReturnType<typeof buildAuth>;
  db: D1Database;
  baseURL: string;
} | null = null;

function getAuthInstance(env: AuthServerEnv): ReturnType<typeof buildAuth> {
  if (cache && cache.db === env.DB && cache.baseURL === env.APP_URL) return cache.auth;
  const auth = buildAuth(env);
  cache = { auth, db: env.DB, baseURL: env.APP_URL };
  return auth;
}

function buildAuth(env: AuthServerEnv) {
  const db = new Kysely<Record<string, unknown>>({
    dialect: new D1Dialect({ database: env.DB }),
  });
  return betterAuth({
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: { db, type: "sqlite" },
    advanced: { cookiePrefix: "gdgjp-tinyurl" },
    user: {
      additionalFields: {
        isAdmin: { type: "boolean", required: false, input: false },
      },
    },
    plugins: [
      genericOAuth({
        config: [
          {
            providerId: SSO_PROVIDER_ID,
            clientId: env.IDP_CLIENT_ID,
            clientSecret: env.IDP_CLIENT_SECRET,
            discoveryUrl: `${env.IDP_URL}/api/auth/.well-known/openid-configuration`,
            scopes: ["openid", "email", "profile"],
            pkce: true,
            mapProfileToUser: (profile) => ({
              email: profile.email,
              name: profile.name ?? profile.email,
              image: profile.picture ?? null,
              emailVerified: profile.email_verified === true,
              isAdmin: profile.isAdmin === true,
            }),
          },
        ],
      }),
    ],
  });
}

export function handleAuthRequest(env: AuthServerEnv, request: Request): Promise<Response> {
  return getAuthInstance(env).handler(request);
}

export function getSessionUser(env: AuthServerEnv, request: Request): Promise<AuthUser | null> {
  return getSessionUserFromApi(getAuthInstance(env) as SessionApi, request);
}

export function requireUser(env: AuthServerEnv, request: Request): Promise<AuthUser> {
  return requireUserFromApi(getAuthInstance(env) as SessionApi, request);
}

export function signOut(env: AuthServerEnv, request: Request): Promise<Response> {
  return getAuthInstance(env).api.signOut({ headers: request.headers, asResponse: true });
}

export type { AuthUser } from "./index";
