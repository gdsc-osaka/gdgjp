# @gdgjp/gdg-lib

Shared auth building blocks for GDG Japan apps. The package ships TypeScript
sources directly (no build step) and is consumed via `workspace:*`.

It provides two factories on top of [better-auth](https://www.better-auth.com/):

| Factory             | Used by                          | Purpose                                                  |
| ------------------- | -------------------------------- | -------------------------------------------------------- |
| `initializeIdpAuth` | `accounts/`                      | Hosts the OIDC provider (login + Google social provider) |
| `initializeAuth`    | `tinyurl/`, `wiki/`, future apps | Hosts a Relying Party that delegates login to accounts   |

The rest of this README focuses on the **RP side** — how to wire a new app up
to the `accounts` IdP.

---

## Implementing a Relying Party (RP)

The accounts app exposes an OIDC discovery document at
`${IDP_URL}/api/auth/.well-known/openid-configuration`. An RP redirects users
there to sign in, receives an ID token, and stores its own better-auth session
cookie scoped to the RP origin.

### 1. Add the dependency

In your app's `package.json`:

```json
{
  "dependencies": {
    "@gdgjp/gdg-lib": "workspace:*",
    "better-auth": "^1.6.9",
    "kysely": "^0.28.0",
    "kysely-d1": "^0.4.0"
  }
}
```

Then `pnpm install` from the repo root.

### 2. Configure Wrangler bindings + secrets

In your app's `wrangler.toml`, declare a D1 binding named `DB` and the env
vars the factory expects. Secrets (`BETTER_AUTH_SECRET`, `IDP_CLIENT_SECRET`)
should be set with `wrangler secret put`, not committed.

```toml
[vars]
APP_URL = "https://your-app.gdgs.jp"
IDP_URL = "https://accounts.gdgs.jp"
IDP_CLIENT_ID = "your-app"

[[d1_databases]]
binding = "DB"
database_name = "your-app"
database_id = "..."
```

Run `pnpm --filter @gdgjp/<app> cf-typegen` to regenerate `Env` types.

### 3. Register your client with the IdP

The accounts app keeps trusted OIDC clients in its `IdpAuthConfig.trustedClients`
list. Add an entry whose `redirectUrls` includes the RP's OAuth callback,
which better-auth serves at `${APP_URL}/api/auth/oauth2/callback/gdgjp`. The
`clientId` / `clientSecret` you choose here are the values the RP passes as
`IDP_CLIENT_ID` / `IDP_CLIENT_SECRET`.

### 4. Create the auth instance (server)

```ts
// app/lib/auth.server.ts
import { type AuthInstance, initializeAuth } from "@gdgjp/gdg-lib";

let cached: { instance: AuthInstance; env: Env } | null = null;

export function getAuth(env: Env): AuthInstance {
  if (cached?.env === env) return cached.instance;
  const instance = initializeAuth({
    db: env.DB,
    appUrl: env.APP_URL,
    cookiePrefix: "gdgjp-<app>", // unique per RP — scopes session cookies
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
```

`AuthInstance` exposes:

- `getSessionUser(request)` — `AuthUser | null`
- `requireUser(request)` — throws a `401` `Response` if unauthenticated
- `signOut(request)` — local-only sign-out (RP cookie cleared)
- `handleAuthRequest(request)` — better-auth handler (callback, session, etc.)
- `handleSignOutRedirect(request, { returnTo? })` — top-level sign-out: clears
  RP cookie, then 302s to the IdP's `/auth/signout` so the IdP session is
  cleared and other RPs are signed out via iframes
- `handleSignOutIframe(request)` — embeddable endpoint the IdP uses to clear
  this RP's cookies during a federated sign-out (sets `frame-ancestors` CSP
  for `IDP_URL`)

### 5. Wire up the routes

The handler paths below match what the better-auth client and the IdP expect.

```ts
// app/routes/api.auth.$.ts — better-auth catch-all (callback, session, csrf)
import { getAuth } from "~/lib/auth.server";
import type { Route } from "./+types/api.auth.$";

export const loader = (a: Route.LoaderArgs) =>
  getAuth(a.context.cloudflare.env).handleAuthRequest(a.request);
export const action = (a: Route.ActionArgs) =>
  getAuth(a.context.cloudflare.env).handleAuthRequest(a.request);
```

```ts
// app/routes/auth.signout.ts — top-level "Sign out" link target
import { getAuth } from "~/lib/auth.server";
import type { Route } from "./+types/auth.signout";

export const loader = ({ request, context }: Route.LoaderArgs) =>
  getAuth(context.cloudflare.env).handleSignOutRedirect(request);
```

```ts
// app/routes/auth.signout-iframe.ts — invoked by the IdP during fed signout
import { getAuth } from "~/lib/auth.server";
import type { Route } from "./+types/auth.signout-iframe";

export const loader = ({ request, context }: Route.LoaderArgs) =>
  getAuth(context.cloudflare.env).handleSignOutIframe(request);
```

Don't forget to register them in `app/routes.ts`.

### 6. Trigger sign-in from the client

```tsx
// app/routes/signin.tsx
import { SSO_PROVIDER_ID, authClient } from "@gdgjp/gdg-lib";
import { useEffect } from "react";

export default function SignInPage() {
  useEffect(() => {
    void authClient.signIn.oauth2({
      providerId: SSO_PROVIDER_ID, // "gdgjp"
      callbackURL: "/", // where to land after the round-trip
    });
  }, []);
  return <p>Redirecting to sign in…</p>;
}
```

### 7. Gate routes with the session helpers

```ts
import { getAuth } from "~/lib/auth.server";
import { isSuperAdmin } from "@gdgjp/gdg-lib";

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await getAuth(context.cloudflare.env).requireUser(request);
  if (!isSuperAdmin(user)) throw new Response("Forbidden", { status: 403 });
  return { user };
}
```

`AuthUser` is `{ id, email, name, isAdmin }`. The `isAdmin` claim is mapped
from the IdP's `userinfo` response (see `mapProfileToUser` in `auth/server.ts`).

---

## Schema

`initializeAuth` opens `env.DB` as a Kysely-wrapped D1 database. better-auth
expects its standard tables (`user`, `session`, `account`, `verification`)
plus an `isAdmin` boolean column on `user` (declared via `additionalFields`).
Generate migrations with the better-auth CLI against the same config and
apply them with `wrangler d1 migrations apply`.

## Sign-out semantics

- `handleSignOutRedirect` is the entry point for a user-initiated sign-out.
  It clears the RP cookie, then bounces to `${IDP_URL}/auth/signout` so the
  IdP can clear its own session and propagate the sign-out to every trusted
  RP via hidden iframes pointing at each RP's `/auth/signout-iframe`.
- `handleSignOutIframe` is what the IdP loads in those iframes. It sets
  `Content-Security-Policy: frame-ancestors 'self' <IDP_URL>` so only the
  IdP origin can embed it.
- `signOut` only clears the local RP cookie — use it when you don't want to
  log the user out of other RPs.
