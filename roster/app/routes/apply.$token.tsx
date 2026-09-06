import {
  createApplication,
  resolveOwnApplication,
  updateApplication,
  withdrawApplication,
} from "~/features/applications/applications.server";
import {
  listAvailabilityForApplication,
  setAvailability,
} from "~/features/applications/availability.server";
import { ApplyForm, type ApplyFormOwn } from "~/features/applications/components/ApplyForm";
import {
  parseAvailabilityFromForm,
  parseSkillsFromForm,
} from "~/features/applications/form-fields";
import {
  listSkillsForApplication,
  setApplicationSkills,
} from "~/features/applications/skills.server";
import { DEFAULT_PARTY, type PartyStatus } from "~/features/applications/types";
import { validateApplyForm } from "~/features/applications/validate";
import { buildSignInRedirect, getOptionalUser } from "~/features/auth/auth-redirect.server";
import { getEventByApplyToken } from "~/features/events/events.server";
import { canApply } from "~/features/events/status";
import { listPhases, listTimeSlots } from "~/features/schedule/schedule.server";
import { listEventRoleIds, listRoles } from "~/features/schedule/tracks.server";
import { getDb } from "~/lib/db.server";
import type { Route } from "./+types/apply.$token";

/**
 * `/apply/:token` (docs/roster/04-applications.md "Design" §2, §5): the
 * public staff-registration form. Gated on `getOptionalUser` — never
 * `requireUserWithChapter` — because Chapter membership must not be
 * required to register as staff. Event lookup is by `apply_token` alone;
 * the event id never appears in this URL.
 *
 * The loader's return value is the whole PII surface of this public route:
 * it must contain the event summary, the recruiting roles, the time-slot
 * grid, and *only the viewer's own* application/skills/availability — never
 * another applicant's name, email, contact, or skills. See
 * `apply.$token.test.ts` for a test that asserts this on the raw returned
 * object, not just on what the UI happens to render.
 */
export function meta({ data }: Route.MetaArgs) {
  return [{ title: data ? `${data.event.name} — スタッフ登録 — roster` : "roster" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const token = params.token;
  if (!token) throw new Response(null, { status: 404 });

  const db = getDb(env);
  const event = await getEventByApplyToken(db, token);
  if (!event) throw new Response(null, { status: 404 });

  const [roles, eventRoleIds, timeSlots, phases] = await Promise.all([
    listRoles(db),
    listEventRoleIds(db, event.id),
    listTimeSlots(db, event.id),
    listPhases(db, event.id),
  ]);
  const roleIdSet = new Set(eventRoleIds);
  const availableRoles = roles
    .filter((role) => roleIdSet.has(role.id))
    .map((role) => ({ id: role.id, name: role.name }));
  const phaseNameById = new Map(phases.map((phase) => [phase.id, phase.name]));
  const timeSlotViews = timeSlots.map((slot) => ({
    id: slot.id,
    start: slot.start,
    end: slot.end,
    phaseName: slot.phaseId ? (phaseNameById.get(slot.phaseId) ?? null) : null,
  }));

  const viewer = await getOptionalUser(env, request);
  const url = new URL(request.url);
  const signInHref = `/signin?return_to=${encodeURIComponent(`${url.pathname}${url.search}`)}`;

  let own: ApplyFormOwn | null = null;
  if (viewer) {
    const resolved = await resolveOwnApplication(db, event.id, {
      userId: viewer.id,
      email: viewer.email,
    });
    if (resolved.kind === "own") {
      const [skills, availability] = await Promise.all([
        listSkillsForApplication(db, resolved.application.id),
        listAvailabilityForApplication(db, resolved.application.id),
      ]);
      own = {
        name: resolved.application.name,
        contact: resolved.application.contact ?? "",
        party: resolved.application.party,
        note: resolved.application.note ?? "",
        withdrawn: resolved.application.withdrawn,
        skills: skills.map((s) => ({ roleId: s.roleId, level: s.level, pref: s.pref })),
        availability: availability.map((a) => ({ timeSlotId: a.timeSlotId, value: a.value })),
      };
    }
  }

  return {
    event: {
      name: event.name,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      hasParty: event.hasParty,
      status: event.status,
    },
    canApplyNow: canApply(event.status),
    viewer: viewer ? { name: viewer.name, email: viewer.email } : null,
    signInHref,
    roles: availableRoles,
    timeSlots: timeSlotViews,
    own,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const token = params.token;
  if (!token) throw new Response(null, { status: 404 });

  const db = getDb(env);
  const event = await getEventByApplyToken(db, token);
  if (!event) throw new Response(null, { status: 404 });

  // Never requireUserWithChapter here — Chapter membership must not gate
  // registering as staff. An unauthenticated write attempt (e.g. a stale
  // form after the session expired) redirects to sign-in instead of 403ing.
  const viewer = await getOptionalUser(env, request);
  if (!viewer) throw buildSignInRedirect(request);

  if (!canApply(event.status)) return { error: "募集は終了しました。" };

  // Resolve server-side from the viewer's identity — never trust a
  // client-submitted application id (docs/roster/04-applications.md
  // "Design" §4 "他人の application に書き込めないこと").
  const resolved = await resolveOwnApplication(db, event.id, {
    userId: viewer.id,
    email: viewer.email,
  });

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "save");

  if (intent === "withdraw") {
    if (resolved.kind !== "own") return { error: "登録が見つかりません。" };
    await withdrawApplication(db, resolved.application.id, "self");
    return { ok: true };
  }

  const [eventRoleIds, timeSlots] = await Promise.all([
    listEventRoleIds(db, event.id),
    listTimeSlots(db, event.id),
  ]);
  const timeSlotIds = timeSlots.map((slot) => slot.id);

  const name = String(form.get("name") ?? "").trim();
  const contactInput = String(form.get("contact") ?? "").trim();
  const party = String(form.get("party") ?? DEFAULT_PARTY) as PartyStatus;
  const note = String(form.get("note") ?? "").trim();
  const skills = parseSkillsFromForm(form, eventRoleIds);
  const availability = parseAvailabilityFromForm(form, timeSlotIds);

  const errors = validateApplyForm(
    { name, contact: contactInput, party, note, skills, availability },
    {
      hasParty: event.hasParty,
      allowedRoleIds: new Set(eventRoleIds),
      timeSlotIds: new Set(timeSlotIds),
    },
  );
  if (errors.length > 0) return { error: errors[0] };

  // "未入力ならアカウントのメールを使う" (docs/roster/04-applications.md
  // "Design" §2) — resolved once here so both create and update store the
  // same fallback rather than leaving it to be re-derived later.
  const contact = contactInput || viewer.email;
  const resolvedParty: PartyStatus = event.hasParty ? party : "undecided";

  let applicationId: string;
  if (resolved.kind === "own") {
    const updated = await updateApplication(db, resolved.application.id, {
      name,
      contact,
      party: resolvedParty,
      note: note || null,
      withdrawn: false,
      updatedBy: "self",
    });
    if (!updated) throw new Response(null, { status: 404 });
    applicationId = updated.id;
  } else {
    const created = await createApplication(db, event.id, {
      userId: viewer.id,
      email: viewer.email,
      name,
      contact,
      party: resolvedParty,
      note: note || null,
      updatedBy: "self",
    });
    if (!created.ok) {
      return {
        error:
          created.reason === "duplicate_email"
            ? "このメールアドレスは既に登録されています。"
            : "既に登録されています。",
      };
    }
    applicationId = created.application.id;
  }

  await Promise.all([
    setApplicationSkills(db, applicationId, skills),
    setAvailability(db, applicationId, availability),
  ]);

  return { ok: true };
}

export default function ApplyPage({ loaderData, actionData }: Route.ComponentProps) {
  const { event, canApplyNow, viewer, signInHref, roles, timeSlots, own } = loaderData;
  const error = actionData && "error" in actionData ? actionData.error : undefined;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 p-6 lg:p-10">
      <div>
        <h1 className="text-2xl font-bold">{event.name}</h1>
        <p className="text-sm text-neutral-600">
          {event.date} {event.startTime}–{event.endTime}
        </p>
      </div>

      {!canApplyNow ? (
        <p className="rounded-[2rem] border-2 border-black bg-white p-6 font-medium">
          募集は終了しました。
        </p>
      ) : !viewer ? (
        <section className="space-y-4 rounded-[2rem] border-2 border-black bg-white p-6 sm:p-8">
          <p>このイベントはスタッフを募集しています。登録するにはサインインしてください。</p>
          {roles.length > 0 ? (
            <div>
              <h2 className="font-bold">募集中の役割</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {roles.map((role) => (
                  <li
                    key={role.id}
                    className="rounded-full border-2 border-black bg-white px-3 py-1 text-sm"
                  >
                    {role.name}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <a
            href={signInHref}
            className="inline-block rounded-full border-2 border-black bg-gdg-blue px-6 py-2.5 font-bold text-white transition hover:brightness-95"
          >
            サインインして登録する
          </a>
        </section>
      ) : (
        <section className="space-y-4 rounded-[2rem] border-2 border-black bg-white p-6 sm:p-8">
          <ApplyForm
            hasParty={event.hasParty}
            roles={roles}
            timeSlots={timeSlots}
            own={own}
            defaultName={viewer.name}
            accountEmail={viewer.email}
            error={error}
          />
        </section>
      )}
    </main>
  );
}
