# roster (`roster.gdgs.jp`)

Staff shift-schedule generator: owners define time slots / tracks / roles / headcount, staff
self-register through a public link, a solver auto-generates a draft schedule, owners hand-edit
and publish. Full plan: `docs/roster/index.md`. Design decisions: `docs/roster/adr.md`. Read both
before touching this app — every stage file assumes their domain model and solver spec.

**Stage 04 of 9** (Stages 01/02 merged; 03/06 build in parallel with 04). Stage 01 was
auth/chapter gate only; Stage 02 added the domain schema (events, the time-slot grid, tracks, the
seeded role master). **This stage** adds staff registration: `applications` /
`application_skills` / `availabilities`, the public `/apply/:applyToken` form, and
`/e/:id/staff`'s proxy-add entry point — see `README.md` "Status" and `ARCHITECTURE.md` for the
current code map.

## Routes (`app/routes.ts`, config mode)

- `/` — event list (auth + chapter): the signed-in user's chapter's events, newest event date
  first, with a link to create one.
- `/events/new` — create an event (name, date, start/end, step size). Also creates the initial
  time-slot grid and a shared "全体" track.
- `/e/:id/design` — event settings, phases + the derived time-slot grid, tracks
  (add/reorder/delete), and role selection. Chapter-gated via `canManageEvent`; 403 for a
  different chapter.
- `/e/:id/staff` — the public apply URL to share, and `ProxyAddDialog` (owner-side proxy
  registration by email, ADR-008). Chapter-gated like `/e/:id/design`. The staff list /
  supply-demand view is Stage 05's job — this stage builds only the entry point.
- `/apply/:token` — **public** staff self-registration. `getOptionalUser`, never
  `requireUserWithChapter` — Chapter membership must not be required to register as staff. Event
  lookup is by `apply_token` alone (`getEventByApplyToken`); the event id never appears in the
  URL. See "Applications / staff registration" below for the loader's PII constraint.
- `/signin`, `/api/auth/*`, `/auth/signout` — gdg-lib relying-party plumbing (`cookiePrefix
  gdgjp-roster`, `ACCOUNTS` service binding).
- `/no-chapter` — shown when the user has no GDG chapter.
- `/dev/login`, `/dev/seed` — local/e2e only; **hard 404 when `ENVIRONMENT === "production"`.**

## Data

- **D1 (`DB`)** — `user` + `oidc_session` (gdg-lib), `events`, `phases`, `time_slots`, `tracks`,
  `roles` (seeded, ADR-007), `event_roles` (Stage 02), plus `applications`, `application_skills`,
  `availabilities` (Stage 04). Migrations in `migrations/`; `schema.sql` is generated
  (`pnpm migrate:local`) — never hand-edit it.
- No ORM. Every feature's `*.server.ts` hand-writes D1 (`*Row` type → `to*()` mapper →
  column-list constant → `RETURNING`, following `scheduler/app/lib/db.ts`'s pattern):
  `app/features/events/events.server.ts` (events CRUD, incl. `getEventByApplyToken`),
  `app/features/schedule/schedule.server.ts` (phases + time-slot regeneration),
  `app/features/schedule/tracks.server.ts` (tracks, the roles master, event_roles),
  `app/features/applications/applications.server.ts` (applications CRUD, claim, dedup),
  `app/features/applications/{skills,availability}.server.ts` (application_skills,
  availabilities — both delete-all-then-insert on every save).
- `time_slots.idx` is 0-based and contiguous per event — the solver's "previous slot" check and
  the public view's contiguous-range grouping both depend on this. Regenerating the grid
  (`schedule.server.ts#regenerateTimeSlots`) keeps the `id` of any slot whose `(start_time,
  end_time)` key is unchanged (`app/features/schedule/reconcile.ts#reconcileSlotKeys`), so
  `availabilities` rows survive an event settings edit.
- **Two UNIQUE indexes on `applications`** enforce ADR-008's dedup: `(event_id, user_id)` partial
  on `WHERE user_id IS NOT NULL`, and `(event_id, email)`. A proxy registration (owner-added,
  `user_id NULL`) is claimed by filling in `user_id` when its email matches a signed-in visitor
  (`applications.server.ts#resolveOwnApplication`), never by inserting a second row.
- **Unit tests for D1 access run against a real SQLite engine** migrated from the actual
  `migrations/*.sql` (`tests/helpers/sqlite-d1.ts`, Node's built-in `node:sqlite` — the same
  approach `wiki/workers/features/sources/test-db.ts` uses), not a hand-mocked `D1Database`. This
  is what lets `applications.server.test.ts` actually exercise the UNIQUE-index dedup rules
  instead of asserting a mock was called correctly.

## Layout (ADR-003 — feature-first from day one)

- Domain code goes in `app/features/<domain>/` (server + client + UI + colocated tests). Auth,
  events, schedule, applications, and the solver are the features so far:
  `app/features/{auth,events,schedule,applications,solver}/`.
- `app/lib/` holds **only** cross-cutting primitives with no domain: `return-to.ts` and
  `db.server.ts` (a D1 handle accessor, no queries — Stage 02). Do not add another file here —
  `tests/architecture/layering.test.ts` whitelists the exact set and fails on any addition. A
  file that looks generic but touches one domain still belongs under `app/features/<domain>/`.
- `app/components/` doesn't exist yet — there's no shared app shell and, per ADR-001, no local
  `ui/` primitives (UI primitives come from `@gdgjp/gdg-lib`). If a later stage adds shell chrome,
  update the layering test's allowlist in the same change.
- The solver (`app/features/solver/`, Stage 06) is a pure TS module — no D1, no React, no
  `fetch`, no `window`. This is what makes it unit-testable and reproducible (ADR-004). It
  defines its own `SolverInput`/`SolverApplication`/`Assignments`/`Report` types in `types.ts`
  rather than importing from `~/features/demand` or `~/features/applications` (Stage 03/04) —
  Stage 07's Worker action is what will map real D1 rows onto these plain types. See
  `app/features/solver/README.md` for the file-by-file breakdown of the 7-step generation flow
  (docs/roster/index.md §5.2).

## Architecture tests (`tests/architecture/`, ported from `wiki/`)

Four tests make the rules above mechanical instead of aspirational (ADR-003): `layering.test.ts`,
`file-size.test.ts` (400-line cap), `test-colocation.test.ts` (`<subject>.test.ts` next to its
source), `route-urls.test.ts` (snapshot of the public URL surface — expect it to fail when you
add a route; update the snapshot once you've confirmed the new URL is intentional). **Every
allowlist in these tests is shrink-only.** Adding to one instead of fixing the placement is not
an option — see `docs/roster/index.md` §8.

## Auth / chapter ACL

`app/features/auth/auth.server.ts` (`getAuth`), `app/features/auth/chapter.server.ts`
(`fetchChaptersForUser`, 30 s cache over `getFreshClaims`; **dev hook**: reads a
`roster-dev-chapters` cookie when `ENVIRONMENT !== "production"`),
`app/features/auth/auth-redirect.server.ts` (`requireUserWithChapter`, `getOptionalUser`).
`app/features/auth/permissions.ts` is the single point of authorization judgment
(`canManageEvent`, `canEditApplication`) — MVP is flat (any member of the owning chapter can
manage an event/edit any of its applications; a signed-in visitor may only edit their own
application; see `docs/roster/index.md` §6), but every future check should route through this
file so a later move to per-role RBAC only touches it.

## Config

Vite: `resolve.dedupe` for react / react-dom / react-router is load-bearing — without it
`@gdgjp/gdg-lib` (consumed as source) leaves the client with two React copies ("invalid hook
call" at hydration). `optimizeDeps.include` only lists what this stage actually renders; extend
it (with `radix-ui` / `lucide-react` / `motion`) the moment a route renders a `@gdgjp/gdg-lib/ui`
component that pulls them in — see `ost/vite.config.ts` for that fuller form.

**Dev port is 5186** (`strictPort: true`), consistently across `vite.config.ts`,
`playwright.config.ts`, `.dev.vars.example`'s `APP_URL`, and `accounts/.dev.vars.example`'s
`ROSTER_REDIRECT_URLS` (ADR-002).

`.dev.vars` needs `RP_SESSION_SECRET`, `IDP_CLIENT_SECRET` (= the accounts worker's
`ROSTER_CLIENT_SECRET`), and `APP_URL=http://localhost:5186` — if `APP_URL` isn't the local
origin, gdg-lib marks cookies `Secure` and plain-HTTP sign-in breaks. It also needs
`ENVIRONMENT=development`: `wrangler.toml` hardcodes `ENVIRONMENT="production"` with no
per-environment section, so without this override `/dev/login` and `/dev/seed` 404 locally too
(both gate on `env.ENVIRONMENT === "production"`) — `.dev.vars.example` has this filled in.
Register the `roster` OIDC client on the accounts side (`accounts/wrangler.toml` vars +
`seed-clients.server.ts` tuple + `accounts/types/env.d.ts`, then `POST /admin/seed-clients`).

Local: `pnpm --filter @gdgjp/roster migrate:local` then `pnpm --filter @gdgjp/roster dev` (port
`5186`); run `accounts` on `5173` for real sign-in, or use
`/dev/login?as=owner&chapter=1:x&return_to=/`.

## Cloudflare resources

This app is **not deployed yet**. `roster/wrangler.toml` ships a placeholder `database_id` —
real provisioning (`wrangler d1 create gdgjp-roster-db`, secrets, DNS route, client seeding) is a
manual follow-up outside this repo's CI, documented in the Stage 01 PR description.
