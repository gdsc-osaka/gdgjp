import { betterAuth } from "better-auth";
import { oidcProvider } from "better-auth/plugins";
import { Kysely } from "kysely";
import { D1Dialect } from "kysely-d1";
import { getChapterByUserId } from "./db";

let cache: { auth: ReturnType<typeof buildAuth>; db: D1Database; baseURL: string } | null = null;

export function getAuth(env: Env): ReturnType<typeof buildAuth> {
  if (cache && cache.db === env.DB && cache.baseURL === env.APP_URL) return cache.auth;
  const auth = buildAuth(env);
  cache = { auth, db: env.DB, baseURL: env.APP_URL };
  return auth;
}

function buildAuth(env: Env) {
  const db = new Kysely<Record<string, unknown>>({ dialect: new D1Dialect({ database: env.DB }) });
  return betterAuth({
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: { db, type: "sqlite" },
    advanced: { cookiePrefix: "gdgjp-accounts" },
    user: {
      additionalFields: {
        isAdmin: { type: "boolean", required: false, input: false },
      },
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        prompt: "select_account",
      },
    },
    plugins: [
      oidcProvider({
        loginPage: "/signin",
        requirePKCE: true,
        storeClientSecret: "plain",
        trustedClients: trustedClientsFromEnv(env),
        getAdditionalUserInfoClaim: async (user, scopes) => {
          if (!scopes.includes("profile")) return {};
          return getChapterClaim(env.DB, user.id);
        },
      }),
    ],
  });
}

function trustedClientsFromEnv(env: Env) {
  const clients: Array<{
    clientId: string;
    clientSecret?: string;
    type: "web";
    name: string;
    redirectUrls: string[];
    metadata: Record<string, unknown> | null;
    disabled: boolean;
    skipConsent: boolean;
  }> = [];
  if (env.TINYURL_CLIENT_ID && env.TINYURL_CLIENT_SECRET) {
    clients.push({
      clientId: env.TINYURL_CLIENT_ID,
      clientSecret: env.TINYURL_CLIENT_SECRET,
      type: "web",
      name: "GDG Japan Links",
      redirectUrls: env.TINYURL_REDIRECT_URLS.split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      metadata: null,
      disabled: false,
      skipConsent: true,
    });
  }
  if (env.WIKI_CLIENT_ID && env.WIKI_CLIENT_SECRET) {
    clients.push({
      clientId: env.WIKI_CLIENT_ID,
      clientSecret: env.WIKI_CLIENT_SECRET,
      type: "web",
      name: "GDG Japan Wiki",
      redirectUrls: env.WIKI_REDIRECT_URLS.split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      metadata: null,
      disabled: false,
      skipConsent: true,
    });
  }
  return clients;
}

async function getChapterClaim(db: D1Database, userId: string) {
  const chapter = await getChapterByUserId(db, userId);
  if (!chapter) return { chapterId: null, chapterSlug: null, chapterRole: null };
  return {
    chapterId: chapter.chapterId,
    chapterSlug: chapter.chapterSlug,
    chapterRole: chapter.role,
  };
}
