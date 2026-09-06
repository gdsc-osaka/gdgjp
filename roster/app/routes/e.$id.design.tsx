import type { ReactNode } from "react";
import { requireUserWithChapter } from "~/features/auth/auth-redirect.server";
import { canManageEvent } from "~/features/auth/permissions";
import { EventSettingsForm } from "~/features/events/components/EventSettingsForm";
import { getEvent, updateEventSettings } from "~/features/events/events.server";
import { isEventStatus } from "~/features/events/status";
import { PhaseList } from "~/features/schedule/components/PhaseList";
import { RolePicker } from "~/features/schedule/components/RolePicker";
import { TrackEditor } from "~/features/schedule/components/TrackEditor";
import {
  createPhase,
  deletePhase,
  listPhases,
  listTimeSlots,
  regenerateTimeSlots,
} from "~/features/schedule/schedule.server";
import { isValidTime } from "~/features/schedule/slots";
import {
  createTrack,
  deleteTrack,
  listEventRoleIds,
  listRoles,
  listTracks,
  reorderTracks,
  setEventRoles,
} from "~/features/schedule/tracks.server";
import { getDb } from "~/lib/db.server";
import type { Route } from "./+types/e.$id.design";

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data ? `${data.event.name} — 設計 — roster` : "roster" }];
}

/**
 * `/e/:id/design` (docs/roster/02-domain-schema.md "Design" §6): event
 * settings, phases + the derived time-slot grid, tracks, and role
 * selection. Chapter-gated via the same `canManageEvent` permission check
 * Stage 01 established — no per-role distinction (docs/roster/index.md §6).
 */
async function requireDesignAccess(env: Env, request: Request, id: string | undefined) {
  const { chapters } = await requireUserWithChapter(env, request);
  if (!id) throw new Response(null, { status: 404 });
  const event = await getEvent(getDb(env), id);
  if (!event) throw new Response(null, { status: 404 });
  if (!canManageEvent(chapters, event)) throw new Response("Forbidden", { status: 403 });
  return event;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const event = await requireDesignAccess(env, request, params.id);
  const db = getDb(env);
  const [phases, timeSlots, tracks, roles, eventRoleIds] = await Promise.all([
    listPhases(db, event.id),
    listTimeSlots(db, event.id),
    listTracks(db, event.id),
    listRoles(db),
    listEventRoleIds(db, event.id),
  ]);
  return { event, phases, timeSlots, tracks, roles, eventRoleIds };
}

async function regenerateAfterScheduleChange(
  db: D1Database,
  event: { id: string; startTime: string; endTime: string; stepMin: number },
) {
  const phases = await listPhases(db, event.id);
  await regenerateTimeSlots(
    db,
    event.id,
    { start: event.startTime, end: event.endTime, stepMin: event.stepMin },
    phases,
  );
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const event = await requireDesignAccess(env, request, params.id);
  const db = getDb(env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  switch (intent) {
    case "updateSettings": {
      const stepMin = Number.parseInt(String(form.get("stepMin") ?? ""), 10);
      const status = String(form.get("status") ?? "");
      const maxConsecutive = Number.parseInt(String(form.get("maxConsecutive") ?? ""), 10);
      if (![15, 30, 60].includes(stepMin)) return { error: "刻み幅が不正です。" };
      if (!isEventStatus(status)) return { error: "ステータスが不正です。" };
      if (maxConsecutive < 3 || maxConsecutive > 6) return { error: "連続稼働の上限が不正です。" };

      const updated = await updateEventSettings(db, event.id, {
        stepMin,
        status,
        maxConsecutive,
        noSoloNewcomer: form.get("noSoloNewcomer") === "1",
      });
      if (!updated) throw new Response(null, { status: 404 });
      // Only the step size changes the slot grid — skip the regenerate
      // round-trip when the other three settings are all that changed.
      if (updated.stepMin !== event.stepMin) {
        await regenerateAfterScheduleChange(db, updated);
      }
      return { ok: true };
    }
    case "createPhase": {
      const name = String(form.get("name") ?? "").trim();
      const from = String(form.get("from") ?? "");
      const to = String(form.get("to") ?? "");
      if (!name || !isValidTime(from) || !isValidTime(to) || from >= to) {
        return { error: "フェーズの入力が不正です。" };
      }
      await createPhase(db, event.id, { name, from, to });
      await regenerateAfterScheduleChange(db, event);
      return { ok: true };
    }
    case "deletePhase": {
      await deletePhase(db, String(form.get("phaseId") ?? ""), event.id);
      await regenerateAfterScheduleChange(db, event);
      return { ok: true };
    }
    case "createTrack": {
      const name = String(form.get("name") ?? "").trim();
      if (!name) return { error: "トラック名を入力してください。" };
      await createTrack(db, event.id, {
        name,
        color: String(form.get("color") ?? "#4285f4"),
        shared: form.get("shared") === "1",
      });
      return { ok: true };
    }
    case "deleteTrack": {
      await deleteTrack(db, String(form.get("trackId") ?? ""), event.id);
      return { ok: true };
    }
    case "moveTrack": {
      const trackId = String(form.get("trackId") ?? "");
      const direction = String(form.get("direction") ?? "");
      const tracks = await listTracks(db, event.id);
      const index = tracks.findIndex((t) => t.id === trackId);
      const swapWith = direction === "up" ? index - 1 : index + 1;
      if (index >= 0 && swapWith >= 0 && swapWith < tracks.length) {
        const ids = tracks.map((t) => t.id);
        [ids[index], ids[swapWith]] = [ids[swapWith], ids[index]];
        await reorderTracks(db, event.id, ids);
      }
      return { ok: true };
    }
    case "setRoles": {
      const submitted = new Set(form.getAll("roleId").map(String));
      const knownIds = new Set((await listRoles(db)).map((r) => r.id));
      const roleIds = [...submitted].filter((id) => knownIds.has(id));
      await setEventRoles(db, event.id, roleIds);
      return { ok: true };
    }
    default:
      return { error: "不明な操作です。" };
  }
}

export default function EventDesign({ loaderData, actionData }: Route.ComponentProps) {
  const { event, phases, timeSlots, tracks, roles, eventRoleIds } = loaderData;
  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-8 p-6 lg:p-10">
      <div>
        <h1 className="text-2xl font-bold">{event.name}</h1>
        <p className="text-sm text-neutral-600">
          {event.date} {event.startTime}–{event.endTime}
        </p>
      </div>

      {actionData && "error" in actionData ? (
        <p role="alert" className="text-sm font-medium text-gdg-red">
          {actionData.error}
        </p>
      ) : null}

      <Section title="イベント設定">
        <EventSettingsForm event={event} />
      </Section>
      <Section title="フェーズと時間枠">
        <PhaseList phases={phases} timeSlots={timeSlots} />
      </Section>
      <Section title="トラック">
        <TrackEditor tracks={tracks} />
      </Section>
      <Section title="使う役割">
        <RolePicker roles={roles} selectedRoleIds={eventRoleIds} />
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-[2rem] border-2 border-black bg-white p-6 sm:p-8">
      <h2 className="text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}
