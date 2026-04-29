# Repository Guidelines

## Project Structure & Module Organization

This is a pnpm/Turborepo workspace with four root-level packages listed in
`pnpm-workspace.yaml`. `accounts/`, `tinyurl/`, and `wiki/` are React Router v7 SSR apps
deployed to Cloudflare Workers. Each app keeps routes in `app/routes/`, route registration in
`app/routes.ts`, shared app helpers in `app/lib/`, UI components in `app/components/` where present,
Worker entrypoints in `workers/`, and Playwright specs in `e2e/`. Static assets live in
`public/`; D1 migrations live in `migrations/`. `auth-lib/` is the shared TypeScript package
exported as `@gdgjp/auth-lib` from `auth-lib/src/`.

## Build, Test, and Development Commands

Run commands from the repository root unless a package-specific command is needed.

- `pnpm dev` starts all app dev servers through Turborepo.
- `pnpm build` builds every app for production.
- `pnpm typecheck` runs Worker type generation, React Router typegen, and `tsc --noEmit`.
- `pnpm test` runs Vitest unit tests across workspaces.
- `pnpm test:e2e` runs Playwright end-to-end tests.
- `pnpm lint`, `pnpm lint:fix`, and `pnpm format` run Biome checks and formatting.

Scope work with filters, for example `pnpm --filter @gdgjp/accounts test` or
`pnpm --filter @gdgjp/tinyurl dev`.

## Coding Style & Naming Conventions

Use TypeScript and ESM. Biome enforces 2-space indentation, double quotes, semicolons, trailing
commas, and 100-character lines. Use `import type` for type-only imports. React routes follow
React Router file naming in `app/routes/`, including dotted paths such as `chapters.$slug.organize.tsx`.
Keep package-local code inside its app unless it is genuinely shared, then move it to `auth-lib/`.

## Testing Guidelines

Unit tests use Vitest and are named `*.test.ts` or `*.test.tsx` near the code they cover. E2E tests
use Playwright and live in each app's `e2e/` directory. Run the narrowest relevant test first, then
`pnpm test` and `pnpm typecheck` before opening a PR. Use package filters for faster iteration.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commit-style subjects such as `feat(accounts): ...` and
`fix(accounts): ...`. Keep commits scoped by package when possible: `feat(tinyurl): add analytics`.
PRs should describe the change, list validation commands run, link related issues, and include
screenshots for UI changes. Note any Cloudflare binding, migration, or `.dev.vars.example` changes.

## Security & Configuration Tips

Do not commit `.dev.vars*`, generated Worker type files, build outputs, Playwright reports, or local
Wrangler state. When editing `wrangler.toml` bindings, rerun the app's `cf-typegen` or `typecheck`
command so local types match Cloudflare configuration.
