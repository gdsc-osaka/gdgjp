import { useMemo, useState } from "react";
import { listApplicationsForEvent } from "~/features/applications/applications.server";
import { requireUserWithChapter } from "~/features/auth/auth-redirect.server";
import { canManageEvent } from "~/features/auth/permissions";
import { getEvent, setEventSeed } from "~/features/events/events.server";
import { CellDrawer } from "~/features/roster/components/CellDrawer";
import { DemandCellDrawer } from "~/features/roster/components/DemandCellDrawer";
import { DemandCoverageGrid } from "~/features/roster/components/DemandCoverageGrid";
import { GeneratePanel, type GenerateResult } from "~/features/roster/components/GeneratePanel";
import { MetricsRow } from "~/features/roster/components/MetricsRow";
import { RoleGrid } from "~/features/roster/components/RoleGrid";
import { ShortageReport } from "~/features/roster/components/ShortageReport";
import { StaffGrid } from "~/features/roster/components/StaffGrid";
import { buildStaffColumns } from "~/features/roster/grid";
import { readAssignmentsMap, writeAssignments } from "~/features/roster/roster.server";
import { buildSolverInput } from "~/features/roster/solver-input.server";
import { ROSTER_VIEWS, ROSTER_VIEW_LABELS, type RosterView } from "~/features/roster/types";
import { useRosterDrawers } from "~/features/roster/use-roster-drawers";
import { listTimeSlots } from "~/features/schedule/schedule.server";
import { listEventRoleIds, listRoles, listTracks } from "~/features/schedule/tracks.server";
import { evaluate } from "~/features/solver/evaluate";
import { solve } from "~/features/solver/solve";
import { type Assignments, type SolverInput, assignmentKey } from "~/features/solver/types";
import { getDb } from "~/lib/db.server";
import type { Route } from "./+types/e.$id.roster";

/**
 * `/e/:id/roster` (docs/roster/07-roster-manual-edit.md): the shift table.
 * "自動生成" runs the Stage 06 solver inside this action (ADR-004) and
 * writes through `roster.server.ts#writeAssignments` — the ONLY write path.
 * Manual editing (`assign`/`unassign`) funnels through the exact same
 * function. `evaluate()`/`hardViolations()`/`suggestFor()` are called here
 * (via `grid.ts`) and, for the live drawers, directly in the browser —
 * they're plain functions with no D1/window dependency (ADR-004), so
 * shipping the assembled `SolverInput` down as loader data and calling them
 * client-side keeps the numbers the drawers show byte-identical to what
 * `evaluate()` reports above them, without a second server round trip per
 * click.
 */

async function requireRosterAccess(env: Env, request: Request, id: string | undefined) {
  const { chapters } = await requireUserWithChapter(env, request);
  if (!id) throw new Response(null, { status: 404 });
  const event = await getEvent(getDb(env), id);
  if (!event) throw new Response(null, { status: 404 });
  if (!canManageEvent(chapters, event)) throw new Response("Forbidden", { status: 403 });
  return { event };
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data ? `${data.event.name} — シフト表 — roster` : "roster" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const { event } = await requireRosterAccess(env, request, params.id);
  const db = getDb(env);

  const [timeSlots, tracks, eventRoleIds, allRoles, applications, input, assignments] =
    await Promise.all([
      listTimeSlots(db, event.id),
      listTracks(db, event.id),
      listEventRoleIds(db, event.id),
      listRoles(db),
      listApplicationsForEvent(db, event.id),
      buildSolverInput(db, event, event.seed),
      readAssignmentsMap(db, event.id),
    ]);

  const roleIdSet = new Set(eventRoleIds);
  const roles = allRoles.filter((r) => roleIdSet.has(r.id));
  const report = evaluate(input, assignments);
  const roleNameById = new Map(roles.map((r) => [r.id, r.name]));
  const staffColumns = buildStaffColumns(applications, input, roleNameById, assignments);

  return {
    event: { id: event.id, name: event.name, status: event.status, seed: event.seed },
    timeSlots: timeSlots.map((s) => ({ id: s.id, idx: s.idx, start: s.start, end: s.end })),
    tracks: tracks.map((t) => ({ id: t.id, name: t.name, color: t.color, sortOrder: t.sortOrder })),
    roles: roles.map((r) => ({ id: r.id, name: r.name, sortOrder: r.sortOrder })),
    staffColumns,
    applicationNameById: Object.fromEntries(applications.map((a) => [a.id, a.name])),
    inputWire: {
      slots: input.slots,
      tracks: input.tracks,
      roles: input.roles,
      applications: input.applications,
      options: input.options,
      demandEntries: [...input.demands],
    },
    assignmentEntries: [...assignments],
    report,
    hasAssignments: assignments.size > 0,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const { event } = await requireRosterAccess(env, request, params.id);
  const db = getDb(env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "generate") {
    const rawSeed = Number(form.get("seed"));
    const seed = Number.isFinite(rawSeed) ? Math.trunc(rawSeed) : event.seed;
    const input = await buildSolverInput(db, event, seed);
    const start = Date.now();
    const { assignments } = solve(input);
    const ms = Date.now() - start;
    await writeAssignments(db, event.id, assignments);
    if (seed !== event.seed) await setEventSeed(db, event.id, seed);
    return { ok: true as const, intent: "generate" as const, ms, seed };
  }

  if (intent === "assign") {
    const applicationId = String(form.get("applicationId") ?? "");
    const trackId = String(form.get("trackId") ?? "");
    const roleId = String(form.get("roleId") ?? "");
    const slotIds = form.getAll("slotId").map(String);
    if (!applicationId || !trackId || !roleId || slotIds.length === 0) {
      return { error: "入力が不正です。", intent: "assign" as const };
    }
    const current = await readAssignmentsMap(db, event.id);
    // Map.set on an existing key overwrites it in place, so this alone both
    // moves the applicant off any OTHER cell they held in this slot and
    // places them in the new one — no separate delete needed.
    for (const slotId of slotIds) {
      current.set(assignmentKey(applicationId, slotId), { trackId, roleId, locked: false });
    }
    await writeAssignments(db, event.id, current);
    return { ok: true as const, intent: "assign" as const };
  }

  if (intent === "unassign") {
    const applicationId = String(form.get("applicationId") ?? "");
    const slotIds = form.getAll("slotId").map(String);
    if (!applicationId || slotIds.length === 0) {
      return { error: "入力が不正です。", intent: "unassign" as const };
    }
    const current = await readAssignmentsMap(db, event.id);
    for (const slotId of slotIds) current.delete(assignmentKey(applicationId, slotId));
    await writeAssignments(db, event.id, current);
    return { ok: true as const, intent: "unassign" as const };
  }

  return { error: "不明な操作です。", intent: "unknown" as const };
}

export default function RosterPage({ loaderData, actionData }: Route.ComponentProps) {
  const {
    event,
    timeSlots,
    tracks,
    roles,
    staffColumns,
    applicationNameById,
    report,
    hasAssignments,
  } = loaderData;

  const input: SolverInput = useMemo(
    () => ({
      slots: loaderData.inputWire.slots,
      tracks: loaderData.inputWire.tracks,
      roles: loaderData.inputWire.roles,
      applications: loaderData.inputWire.applications,
      options: loaderData.inputWire.options,
      demands: new Map(loaderData.inputWire.demandEntries),
    }),
    [loaderData.inputWire],
  );
  const assignments: Assignments = useMemo(
    () => new Map(loaderData.assignmentEntries),
    [loaderData.assignmentEntries],
  );

  const trackNameById = useMemo(() => new Map(tracks.map((t) => [t.id, t.name])), [tracks]);
  const roleNameById = useMemo(() => new Map(roles.map((r) => [r.id, r.name])), [roles]);
  const slotLabelById = useMemo(
    () => new Map(timeSlots.map((s) => [s.id, `${s.start}–${s.end}`])),
    [timeSlots],
  );
  const trackInfoById = useMemo(
    () => new Map(tracks.map((t) => [t.id, { name: t.name, color: t.color }])),
    [tracks],
  );
  const applicationNameByIdMap = useMemo(
    () => new Map(Object.entries(applicationNameById)),
    [applicationNameById],
  );

  const [view, setView] = useState<RosterView>("staff");

  const actionIntent = actionData && "intent" in actionData ? actionData.intent : undefined;
  const actionError = actionData && "error" in actionData ? actionData.error : undefined;
  const actionSucceeded =
    actionData && "ok" in actionData && actionData.ok ? actionData : undefined;

  const cellSucceeded =
    actionIntent === "assign" || actionIntent === "unassign" ? actionSucceeded : undefined;
  const cellError =
    actionIntent === "assign" || actionIntent === "unassign" ? actionError : undefined;

  const drawers = useRosterDrawers({
    input,
    assignments,
    applicationNameById,
    slotLabelById,
    trackNameById,
    roleNameById,
    closeOnSuccess: cellSucceeded,
  });

  // The generate action has no failure path today (seed is always coerced
  // to a valid number, and buildSolverInput/solve don't reject any input
  // shape this route can produce) — GenerateResult's `ok: false` variant
  // exists for GeneratePanel's own robustness, not because this branch can
  // currently construct one.
  let generateResult: GenerateResult | undefined;
  if (actionData?.intent === "generate" && "ok" in actionData && actionData.ok) {
    generateResult = { ok: true, ms: actionData.ms, seed: actionData.seed };
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 p-6 lg:p-10">
      <div>
        <h1 className="text-2xl font-bold">{event.name}</h1>
        <p className="text-sm text-neutral-600">シフト表</p>
      </div>

      <GeneratePanel
        seed={event.seed}
        hasAssignments={hasAssignments}
        lastResult={generateResult}
      />

      {hasAssignments ? (
        <>
          <MetricsRow metrics={report.metrics} />
          <ShortageReport
            report={report}
            slotLabelById={slotLabelById}
            trackNameById={trackNameById}
            roleNameById={roleNameById}
          />

          <div className="inline-flex w-fit rounded-full border-2 border-black bg-white p-1">
            {ROSTER_VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                  view === v ? "bg-gdg-blue text-white" : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {ROSTER_VIEW_LABELS[v]}
              </button>
            ))}
          </div>

          {view === "staff" ? (
            <StaffGrid
              timeSlots={timeSlots}
              columns={staffColumns}
              assignments={assignments}
              trackById={trackInfoById}
              roleNameById={roleNameById}
              onCellClick={drawers.openStaffCell}
            />
          ) : null}
          {view === "role" ? (
            <RoleGrid
              timeSlots={timeSlots}
              tracks={tracks}
              roles={roles}
              demands={input.demands}
              assignments={assignments}
              nameById={applicationNameByIdMap}
              onSelectCell={drawers.openDemandCell}
            />
          ) : null}
          {view === "coverage" ? (
            <DemandCoverageGrid
              timeSlots={timeSlots}
              tracks={tracks}
              roles={roles}
              demands={input.demands}
              assignments={assignments}
              report={report}
              onSelectCell={drawers.openDemandCell}
            />
          ) : null}
        </>
      ) : null}

      <CellDrawer
        selection={drawers.staffSelection}
        current={drawers.staffCurrent}
        candidates={drawers.staffCandidates}
        trackNameById={trackNameById}
        roleNameById={roleNameById}
        error={cellError}
        succeeded={cellSucceeded}
        onClose={drawers.closeStaffCell}
      />
      <DemandCellDrawer
        selection={drawers.demandSelection}
        demand={drawers.demandForSelection}
        currentOccupants={drawers.demandOccupants}
        suggestions={drawers.demandSuggestions}
        error={cellError}
        succeeded={cellSucceeded}
        onClose={drawers.closeDemandCell}
      />
    </main>
  );
}
