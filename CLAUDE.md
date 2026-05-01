# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout (flat, not `apps/` + `packages/`)

Apps and the shared lib sit at the repo root:

- `accounts/` — auth app (`@gdgjp/accounts`, account.gdgs.jp)
- `tinyurl/` — URL shortener (url.gdgs.jp)
- `wiki/` — community wiki (wiki.gdgs.jp)
- `auth-lib/` — `@gdgjp/auth-lib` shared package, consumed via `workspace:*`

`pnpm-workspace.yaml` lists these four directories explicitly. When adding a new app, add it there and run `pnpm install`.

Each app is a React Router v7 (framework mode, SSR) app deployed to Cloudflare Workers. The Worker entry is `workers/app.ts`, which wires `createRequestHandler` to the virtual server build and exposes `env`/`ctx` on `AppLoadContext` under `context.cloudflare`. Routes live in `app/routes/` and are registered in `app/routes.ts`. The `~/*` import alias maps to `./app/*`.

D1 and KV bindings are commented out in each `wrangler.toml` — uncomment and fill IDs before using them, then re-run `pnpm cf-typegen` (or `pnpm typecheck`) inside the app to regenerate `worker-configuration.d.ts`.

## Commands

Run from the repo root unless noted. Turborepo fans out to all workspaces.

- `pnpm dev` — run all apps' dev servers (`react-router dev`, persistent, uncached)
- `pnpm build` — production build of every app
- `pnpm typecheck` — runs `wrangler types && react-router typegen && tsc --noEmit` per app
- `pnpm test` — Vitest unit tests across all workspaces
- `pnpm test:e2e` — Playwright E2E (boots `pnpm dev` via the `webServer` config)
- `pnpm lint` / `pnpm lint:fix` / `pnpm format` — Biome (no ESLint/Prettier)
- `pnpm deploy` — `wrangler deploy` per app (depends on `build`)

Scope to a single app with `--filter`:

```
pnpm --filter @gdgjp/accounts dev
pnpm --filter @gdgjp/accounts test
pnpm --filter @gdgjp/accounts test:e2e
```

Single Vitest file: `pnpm --filter @gdgjp/accounts exec vitest run app/path/to/file.test.ts`.
Single Playwright spec: `pnpm --filter @gdgjp/accounts exec playwright test e2e/home.spec.ts`.

After editing `wrangler.toml` bindings, run `pnpm --filter @gdgjp/<app> cf-typegen` to refresh Worker types.

## Conventions

- Biome enforces double quotes, semicolons, trailing commas, 2-space indent, 100-col lines, and `useImportType: error` — use `import type { ... }` for type-only imports.
- TypeScript uses `verbatimModuleSyntax` and `isolatedModules` (inherited from `tsconfig.base.json`); type-only imports/exports must be marked explicitly.
- The shared lib `@gdgjp/auth-lib` exports source TS directly (`"main": "./src/index.ts"`) — there is no build step for it; consumers compile it through their own bundler.
- CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, build, and Playwright as separate jobs on Node 20 + pnpm. Keep all five green.
