# events

The `events` table: CRUD and the 5-state status lifecycle (`draft` → `open` → `closed` →
`published` → `ended`, freely reversible). `canApply`/`canView` are the only two predicates that
gate public URLs (Stage 04's `/apply/:applyToken`, Stage 09's `/r/:viewToken`) — see
`docs/roster/index.md` §3.

Entry points:

- `events.server.ts` — D1 access (`createEvent`, `getEvent`, `listEventsForChapters`,
  `updateEventSettings`). `apply_token`/`view_token` are random, independent of `id`. Every read
  filters `deleted_at IS NULL`.
- `status.ts` — the pure status lifecycle and its two behavioral predicates.
- `components/` — `EventForm` (`/events/new`), `EventCard` (the `/` list row),
  `EventSettingsForm` (the `/e/:id/design` settings card).

The time-slot grid, tracks, and roles are a separate feature: `~/features/schedule/`.
