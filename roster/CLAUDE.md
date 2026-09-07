# roster (`roster.gdgs.jp`)

Staff shift-schedule generator: owners define time slots / tracks / roles / headcount, staff
self-register through a public link, a solver auto-generates a draft schedule, owners hand-edit
and publish. Full plan: `docs/roster/index.md`. Design decisions: `docs/roster/adr.md`. Read both
before touching this app — every stage file assumes their domain model and solver spec.

**Stage 08 of 9** (Stages 01–07 merged). Stage 01 was auth/chapter gate only; Stage 02 added the
domain schema (events, the time-slot grid, tracks, the seeded role master); Stage 03 added demand
input (the `demands` table, the `/e/:id/design` demand matrix); Stage 04 added staff registration
(`applications`/`application_skills`/`availabilities`, the public `/apply/:applyToken` form,
`/e/:id/staff`'s proxy-add entry point); Stage 05 cross-checked demand against applications
(`app/features/supply/`) and added the staff list/owner-correction drawer to `/e/:id/staff`; Stage
06 built the solver as a pure TS module; Stage 07 wired it up as the `assignments` table,
`app/features/roster/` (assembling a real `SolverInput` from D1, the single `writeAssignments`
write path, and the 3-view grid + manual-edit drawers), and the `/e/:id/roster` route. **This
stage** adds operation history on top: the `revisions` table + `events.revision_cursor`,
`app/features/history/` (`recordRevision`/`restoreRevision`, consecutive-edit grouping, 50-entry
retention, a versioned snapshot codec), and `/e/:id/roster`'s new history panel + undo/redo/
restore controls — see `README.md` and `ARCHITECTURE.md` for the current code map. Stage 09
(public share views, `/r/:viewToken`, `/e/:id/share`) is a separate, independent stage this one
does not touch.

## Routes (`app/routes.ts`, config mode)

- `/` — event list (auth + chapter): the signed-in user's chapter's events, newest event date
  first, with a link to create one.
- `/events/new` — create an event (name, date, start/end, step size). Also creates the initial
  time-slot grid and a shared "全体" track.
- `/e/:id/design` — event settings, phases + the derived time-slot grid, tracks
  (add/reorder/delete), role selection, and the demand matrix (Stage 03: `min`/`ideal`/`leadMin`/
  `newMax` per time-slot x track x role, phase-wide or per-slot). Chapter-gated via
  `canManageEvent`; 403 for a different chapter.
- `/e/:id/staff` — chapter-gated like `/e/:id/design`. The staff list (`StaffTable`) with an
  owner-correction drawer (`StaffDrawer`), the supply-vs-demand view (`SupplyDemandRow`/
  `ShortageSummary`), the apply-URL/status card (`ApplyLinkCard`), and `ProxyAddDialog`
  (owner-side proxy registration by email, ADR-008).
- `/e/:id/roster` — chapter-gated like `/e/:id/design`/`/e/:id/staff`. The shift table: the
  `GeneratePanel` (自動生成/再生成, seed input), `MetricsRow`/`ShortageReport` (rendered from
  `evaluate()`'s `Report`, never a separate tally), 3 views (`StaffGrid`/`RoleGrid`/
  `DemandCoverageGrid`) selected by a segmented control, 2 manual-edit dialogs (`CellDrawer`,
  `DemandCellDrawer`) — both warn-and-allow, never blocking, per index.md §5.1's deliberate
  asymmetry with auto-generation — and (Stage 08) `UndoRedoButtons` + `HistoryPanel` below the
  grids, backed by `undo`/`redo`/`restore` action intents that move `events.revision_cursor`
  without ever creating a new revision.
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
  `roles` (seeded, ADR-007), `event_roles` (Stage 02), `demands` (Stage 03), `applications`,
  `application_skills`, `availabilities` (Stage 04), `assignments` (Stage 07 — the current
  shift table; `PRIMARY KEY (application_id, time_slot_id)`, not a surrogate id, is what makes
  "never assign the same staff member to the same slot twice" structurally impossible), plus
  `revisions` + `events.revision_cursor` (Stage 08 — operation history, ADR-006: a JSON snapshot
  per revision, NOT a per-timepoint duplicate of `assignments` itself; `revision_cursor` is which
  revision's snapshot is currently reflected in `assignments`, `NULL` meaning "no history yet").
  Migrations in `migrations/`; `schema.sql` is generated (`pnpm migrate:local`) — never hand-edit
  it.
- No ORM. Every feature's `*.server.ts` hand-writes D1 (`*Row` type → `to*()` mapper →
  column-list constant → `RETURNING`, following `scheduler/app/lib/db.ts`'s pattern):
  `app/features/events/events.server.ts` (events CRUD, incl. `getEventByApplyToken`),
  `app/features/schedule/schedule.server.ts` (phases + time-slot regeneration),
  `app/features/schedule/tracks.server.ts` (tracks, the roles master, event_roles),
  `app/features/demand/demand.server.ts` (the demand matrix's D1 access — `ideal_count = 0` reads
  and writes identically to the row not existing at all),
  `app/features/applications/applications.server.ts` (applications CRUD, claim, dedup, and Stage
  05's `correctApplication` — the owner-correction write bundle `StaffDrawer` uses),
  `app/features/applications/{skills,availability}.server.ts` (application_skills,
  availabilities — both delete-all-then-insert on every save),
  `app/features/supply/supply.server.ts` (Stage 05 — orchestrates the above plus
  `demand.server.ts`'s reads into the per-time-slot supply-vs-demand snapshot; writes nothing),
  `app/features/roster/roster.server.ts` (Stage 07 — `readAssignments`/`readAssignmentsMap` and
  `writeAssignments`, the **only** function that writes to `assignments`: always a full
  delete-then-reinsert via `db.batch`, never a partial patch; Stage 08 gives it an optional
  `revision` argument that, when present, calls `history.server.ts#recordRevision` after the
  write — `writeManualEdit`, also here, is the `assign`/`unassign` intents' shared tail:
  re-evaluate against the current `SolverInput` and write through with `kind: "edit"`),
  `app/features/history/history.server.ts` (Stage 08 — `revisions` D1 access:
  `recordRevision`/`restoreRevision`/`undoRevision`/`redoRevision`/`getHistoryState`; see
  "History" below).
- `app/features/roster/solver-input.server.ts` (Stage 07) is the only place D1 rows are mapped
  onto the solver's plain `SolverInput` type (ADR-004) — reuses `demand`/`applications`/
  `schedule`'s reads verbatim, filters out withdrawn applicants entirely, and explicitly re-sorts
  applications by id / demand entries by key so the generate action's determinism doesn't
  silently depend on D1's row return order.
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

## History (Stage 08)

- **`recordRevision` inserts a new `revisions` row, or — when `grouping.ts#shouldMergeIntoHead`
  says the current head is a same-actor `edit` made within the last 5 minutes (`GROUP_WINDOW_MS`)
  — overwrites that head row in place.** `generate` never merges regardless of timing. Truncates
  any "future" (redo) rows past the cursor before inserting a new one (rewind-then-edit discards
  the branch, no multi-branch history), and evicts the oldest row(s) once `retention.ts`'s 50-entry
  cap (`RETENTION_LIMIT`) is exceeded — insert, truncation, and eviction are one `db.batch`.
- **`restoreRevision` never creates a revision.** It reads a snapshot, filters out any
  `application_id` that's gone or withdrawn and any `time_slot_id` that no longer exists for the
  event (a withdrawal or a schedule regeneration since the snapshot was taken), writes the
  filtered map through `writeAssignments` (no `revision` argument), and moves
  `events.revision_cursor` — returning the filtered-out count as `droppedCount`, which the route
  surfaces as "N件の割当は対象が存在しないため復元されませんでした。" `undoRevision`/`redoRevision`
  move the cursor one step and call `restoreRevision`.
- **Intentional two-way import**: `roster.server.ts#writeAssignments` imports
  `history.server.ts#recordRevision` (the Stage 08 hook), and `history.server.ts#restoreRevision`
  imports `roster.server.ts#writeAssignments` (reusing the one write path, never a bespoke
  `INSERT`/`DELETE`). Both directions only call the other's function from inside an `async`
  function body at request time, and both are `function` declarations (hoisted), so this carries
  no ESM init-order hazard — see `app/features/history/README.md`.
- `app/features/history/{grouping,retention,cursor}.ts` are pure functions (no D1) — the 5-minute
  merge window, the 50-entry cap, and the undo/redo button enable/disable boundary are all
  unit-tested independent of D1.

## Layout (ADR-003 — feature-first from day one)

- Domain code goes in `app/features/<domain>/` (server + client + UI + colocated tests). Auth,
  events, schedule, demand, applications, the solver, supply, roster, and history are the features
  so far: `app/features/{auth,events,schedule,demand,applications,solver,supply,roster,history}/`.
- `roster/` (Stage 07) assembles the solver's `SolverInput` from D1 and owns the single
  `assignments` write path (`roster.server.ts#writeAssignments`) and the `/e/:id/roster` grid/
  drawer components. It imports from `demand/`, `applications/`, `schedule/`, `solver/`, and
  (Stage 08) `history/` — none of those import back FROM `roster/`, except `history/` itself,
  which `roster/` also imports from (see next bullet). See `app/features/roster/README.md`.
- `history/` (Stage 08) is the one feature with a genuinely two-way relationship: it imports
  `roster/`'s `writeAssignments` (for `restoreRevision`'s D1 write), and `roster/`'s
  `writeAssignments` imports `history/`'s `recordRevision` (the hook on every write). See
  `app/features/history/README.md` for why this specific cycle is safe.
- `supply/` (Stage 05) is the demand-vs-applications cross-check: it imports from both `demand/`
  and `applications/` — the only sanctioned direction. Neither of those two may import from
  `supply/`; `applications/staff-view.ts` deliberately takes a structurally-`supply/`-compatible
  input type instead of importing `supply/`'s own type, to keep the dependency one-way.
- `app/lib/` holds **only** cross-cutting primitives with no domain: `return-to.ts` and
  `db.server.ts` (a D1 handle accessor, no queries — Stage 02). Do not add another file here —
  `tests/architecture/layering.test.ts` whitelists the exact set and fails on any addition. A
  file that looks generic but touches one domain still belongs under `app/features/<domain>/`.
- `app/components/` doesn't exist yet — there's no shared app shell and, per ADR-001, no local
  `ui/` primitives (UI primitives come from `@gdgjp/gdg-lib`). If a later stage adds shell chrome,
  update the layering test's allowlist in the same change.
- The solver (`app/features/solver/`, Stage 06) is a pure TS module — no D1, no React, no
  `fetch`, no `window`. This is what makes it unit-testable and reproducible (ADR-004), and what
  lets Stage 07's manual-edit drawers call `hardViolations`/`suggestFor` directly in the browser.
  It defines its own `SolverInput`/`SolverApplication`/`Assignments`/`Report` types in `types.ts`
  rather than importing from `~/features/demand` or `~/features/applications` (Stage 03/04) —
  `app/features/roster/solver-input.server.ts` (Stage 07) is what maps real D1 rows onto these
  plain types. See `app/features/solver/README.md` for the file-by-file breakdown of the 7-step
  generation flow (docs/roster/index.md §5.2).

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
