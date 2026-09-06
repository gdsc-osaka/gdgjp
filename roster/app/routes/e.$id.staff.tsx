import { useEffect, useState } from "react";
import {
  correctApplication,
  createApplication,
  getApplicationByEventAndEmail,
  getApplicationById,
  updateApplication,
  withdrawApplication,
} from "~/features/applications/applications.server";
import { setAvailability } from "~/features/applications/availability.server";
import { ProxyAddDialog } from "~/features/applications/components/ProxyAddDialog";
import { StaffDrawer } from "~/features/applications/components/StaffDrawer";
import { StaffTable } from "~/features/applications/components/StaffTable";
import {
  parseAvailabilityFromForm,
  parseSkillsFromForm,
} from "~/features/applications/form-fields";
import { setApplicationSkills } from "~/features/applications/skills.server";
import { buildStaffRows, toStaffDrawerDetail } from "~/features/applications/staff-view";
import { DEFAULT_PARTY, type PartyStatus } from "~/features/applications/types";
import { validateApplyForm } from "~/features/applications/validate";
import { requireUserWithChapter } from "~/features/auth/auth-redirect.server";
import { canEditApplication, canManageEvent } from "~/features/auth/permissions";
import { getEvent } from "~/features/events/events.server";
import { listPhases, listTimeSlots } from "~/features/schedule/schedule.server";
import { listEventRoleIds, listRoles } from "~/features/schedule/tracks.server";
import { listApplicantDetailsForEvent } from "~/features/supply/supply.server";
import { getDb } from "~/lib/db.server";
import type { Route } from "./+types/e.$id.staff";

/**
 * `/e/:id/staff` (docs/roster/05-staff-supply-demand.md "Design" §2, §4):
 * Chapter-gated, same access pattern as `/e/:id/design`. Stage 04 built only
 * the proxy-add entry point; this stage adds the staff list (`StaffTable`)
 * and owner-correction drawer (`StaffDrawer`) — the supply-demand view
 * (`SupplyDemandRow`/`ShortageSummary`) and the apply-URL/status card
 * (`ApplyLinkCard`) land in a later commit on this same route.
 */
// Deliberately loose — a sanity check against typos, not RFC 5322
// validation. Don't tighten this without checking real-world addresses it'd
// reject; accounts.gdgs.jp is the actual source of truth for whether an
// address is real (this route only decides whether it looks well-formed
// enough to store).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireStaffAccess(env: Env, request: Request, id: string | undefined) {
  const { chapters } = await requireUserWithChapter(env, request);
  if (!id) throw new Response(null, { status: 404 });
  const event = await getEvent(getDb(env), id);
  if (!event) throw new Response(null, { status: 404 });
  if (!canManageEvent(chapters, event)) throw new Response("Forbidden", { status: 403 });
  return { event, chapters };
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data ? `${data.event.name} — 募集・スタッフ — roster` : "roster" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const { event } = await requireStaffAccess(env, request, params.id);
  const db = getDb(env);
  const [roles, eventRoleIds, timeSlots, phases, applicantDetails] = await Promise.all([
    listRoles(db),
    listEventRoleIds(db, event.id),
    listTimeSlots(db, event.id),
    listPhases(db, event.id),
    listApplicantDetailsForEvent(db, event.id),
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

  const staff = buildStaffRows(
    applicantDetails,
    availableRoles,
    timeSlots.map((slot) => slot.id),
  );
  const staffDetails = Object.fromEntries(
    applicantDetails.map((d) => [d.application.id, toStaffDrawerDetail(d)]),
  );

  return {
    event: { id: event.id, name: event.name, hasParty: event.hasParty },
    applyUrl: `${env.APP_URL}/apply/${event.applyToken}`,
    roles: availableRoles,
    timeSlots: timeSlotViews,
    staff,
    staffDetails,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const { event, chapters } = await requireStaffAccess(env, request, params.id);
  const db = getDb(env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "correct" || intent === "withdraw") {
    const applicationId = String(form.get("applicationId") ?? "");
    const existing = await getApplicationById(db, event.id, applicationId);
    if (!existing) throw new Response(null, { status: 404 });
    // Always true here in practice (this whole route already required
    // canManageEvent above), but routes the check through the single point
    // of permission judgment (docs/roster/index.md §6) rather than assuming
    // the earlier gate covers every future caller of this branch.
    if (!canEditApplication(null, chapters, event, existing)) {
      throw new Response("Forbidden", { status: 403 });
    }

    if (intent === "withdraw") {
      await withdrawApplication(db, existing.id, "owner");
      return { ok: true, intent: "withdraw" as const };
    }

    const [eventRoleIds, timeSlots] = await Promise.all([
      listEventRoleIds(db, event.id),
      listTimeSlots(db, event.id),
    ]);
    const timeSlotIds = timeSlots.map((slot) => slot.id);
    const skills = parseSkillsFromForm(form, eventRoleIds);
    const availability = parseAvailabilityFromForm(form, timeSlotIds);

    const errors = validateApplyForm(
      {
        name: existing.name,
        contact: existing.contact ?? "",
        party: existing.party,
        note: existing.note ?? "",
        skills,
        availability,
      },
      {
        hasParty: event.hasParty,
        allowedRoleIds: new Set(eventRoleIds),
        timeSlotIds: new Set(timeSlotIds),
      },
    );
    if (errors.length > 0) return { error: errors[0], intent: "correct" as const };

    await correctApplication(db, existing, { skills, availability });
    return { ok: true, intent: "correct" as const };
  }

  if (intent !== "proxyAdd") return { error: "不明な操作です。", intent: "unknown" as const };

  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const name = String(form.get("name") ?? "").trim();
  const contactInput = String(form.get("contact") ?? "").trim();
  const party = String(form.get("party") ?? DEFAULT_PARTY) as PartyStatus;
  const note = String(form.get("note") ?? "").trim();

  if (!EMAIL_RE.test(email)) {
    return { error: "メールアドレスの形式が正しくありません。", intent: "proxyAdd" as const };
  }

  const [eventRoleIds, timeSlots] = await Promise.all([
    listEventRoleIds(db, event.id),
    listTimeSlots(db, event.id),
  ]);
  const timeSlotIds = timeSlots.map((slot) => slot.id);
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
  if (errors.length > 0) return { error: errors[0], intent: "proxyAdd" as const };

  const contact = contactInput || email;
  const resolvedParty: PartyStatus = event.hasParty ? party : "undecided";

  // Upsert by (event, email) — ADR-008's "代理登録のみ user_id が NULL"
  // dedup key. A second proxyAdd for the same email edits that row
  // (owner-vs-owner or owner-vs-self, "最後に書いた側が勝つ") rather than
  // creating a duplicate; `userId` is left untouched either way.
  const existingByEmail = await getApplicationByEventAndEmail(db, event.id, email);
  let applicationId: string;
  if (existingByEmail) {
    const updated = await updateApplication(db, existingByEmail.id, {
      name,
      contact,
      party: resolvedParty,
      note: note || null,
      withdrawn: false,
      updatedBy: "owner",
    });
    if (!updated) throw new Response(null, { status: 404 });
    applicationId = updated.id;
  } else {
    const created = await createApplication(db, event.id, {
      userId: null,
      email,
      name,
      contact,
      party: resolvedParty,
      note: note || null,
      updatedBy: "owner",
    });
    if (!created.ok) return { error: "既に登録されています。", intent: "proxyAdd" as const };
    applicationId = created.application.id;
  }

  await Promise.all([
    setApplicationSkills(db, applicationId, skills),
    setAvailability(db, applicationId, availability),
  ]);

  return { ok: true, intent: "proxyAdd" as const };
}

export default function StaffPage({ loaderData, actionData }: Route.ComponentProps) {
  const { event, applyUrl, roles, timeSlots, staff, staffDetails } = loaderData;
  const actionIntent = actionData && "intent" in actionData ? actionData.intent : undefined;
  const error = actionData && "error" in actionData ? actionData.error : undefined;
  // A fresh object only on an actual success — an error response is also a
  // truthy object, so a dialog can't tell "an action ran" from "the action
  // succeeded" without this being computed here.
  const succeeded = actionData && "ok" in actionData && actionData.ok ? actionData : undefined;

  const proxyError = actionIntent === "proxyAdd" ? error : undefined;
  const proxySucceeded = actionIntent === "proxyAdd" ? succeeded : undefined;
  const staffError = actionIntent === "correct" || actionIntent === "withdraw" ? error : undefined;
  const staffSucceeded =
    actionIntent === "correct" || actionIntent === "withdraw" ? succeeded : undefined;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (staffSucceeded) setSelectedId(null);
  }, [staffSucceeded]);
  const selectedDetail = selectedId ? (staffDetails[selectedId] ?? null) : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col gap-6 p-6 lg:p-10">
      <div>
        <h1 className="text-2xl font-bold">{event.name}</h1>
        <p className="text-sm text-neutral-600">募集・スタッフ</p>
      </div>

      <section className="space-y-3 rounded-[2rem] border-2 border-black bg-white p-6 sm:p-8">
        <h2 className="font-bold">スタッフ一覧</h2>
        <StaffTable rows={staff} hasParty={event.hasParty} onSelect={setSelectedId} />
      </section>

      <StaffDrawer
        detail={selectedDetail}
        roles={roles}
        timeSlots={timeSlots}
        error={staffError}
        succeeded={staffSucceeded}
        onClose={() => setSelectedId(null)}
      />

      <section className="space-y-3 rounded-[2rem] border-2 border-black bg-white p-6 sm:p-8">
        <h2 className="font-bold">公開登録 URL</h2>
        <p className="text-sm text-neutral-600">
          このURLを共有すると、Chapterに所属していない人でもスタッフとして登録できます。
        </p>
        <code className="block break-all rounded-xl bg-neutral-100 p-3 text-sm">{applyUrl}</code>
      </section>

      <section className="space-y-3 rounded-[2rem] border-2 border-black bg-white p-6 sm:p-8">
        <h2 className="font-bold">代理登録</h2>
        <p className="text-sm text-neutral-600">
          口頭やその場で参加を伝えてきた人を、メールアドレスを指定して登録します。本人が同じ
          メールアドレスでサインインすると、この登録を引き継げます。
        </p>
        <ProxyAddDialog
          hasParty={event.hasParty}
          roles={roles}
          timeSlots={timeSlots}
          error={proxyError}
          succeeded={proxySucceeded}
        />
      </section>
    </main>
  );
}
