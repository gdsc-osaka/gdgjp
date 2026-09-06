import {
  createApplication,
  getApplicationByEventAndEmail,
  updateApplication,
} from "~/features/applications/applications.server";
import { setAvailability } from "~/features/applications/availability.server";
import { ProxyAddDialog } from "~/features/applications/components/ProxyAddDialog";
import {
  parseAvailabilityFromForm,
  parseSkillsFromForm,
} from "~/features/applications/form-fields";
import { setApplicationSkills } from "~/features/applications/skills.server";
import { DEFAULT_PARTY, type PartyStatus } from "~/features/applications/types";
import { validateApplyForm } from "~/features/applications/validate";
import { requireUserWithChapter } from "~/features/auth/auth-redirect.server";
import { canManageEvent } from "~/features/auth/permissions";
import { getEvent } from "~/features/events/events.server";
import { listPhases, listTimeSlots } from "~/features/schedule/schedule.server";
import { listEventRoleIds, listRoles } from "~/features/schedule/tracks.server";
import { getDb } from "~/lib/db.server";
import type { Route } from "./+types/e.$id.staff";

/**
 * `/e/:id/staff` (docs/roster/04-applications.md "Design" §3, "Files to
 * touch"): Chapter-gated, same access pattern as `/e/:id/design`. This
 * stage builds **only the proxy-add entry point** — the public apply URL to
 * share and the "代理登録" dialog. The staff list / supply-demand view is
 * Stage 05's job (docs/roster/index.md §6 screen table).
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireStaffAccess(env: Env, request: Request, id: string | undefined) {
  const { chapters } = await requireUserWithChapter(env, request);
  if (!id) throw new Response(null, { status: 404 });
  const event = await getEvent(getDb(env), id);
  if (!event) throw new Response(null, { status: 404 });
  if (!canManageEvent(chapters, event)) throw new Response("Forbidden", { status: 403 });
  return event;
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data ? `${data.event.name} — 募集・スタッフ — roster` : "roster" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const event = await requireStaffAccess(env, request, params.id);
  const db = getDb(env);
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

  return {
    event: { id: event.id, name: event.name, hasParty: event.hasParty },
    applyUrl: `${env.APP_URL}/apply/${event.applyToken}`,
    roles: availableRoles,
    timeSlots: timeSlotViews,
  };
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const event = await requireStaffAccess(env, request, params.id);
  const db = getDb(env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (intent !== "proxyAdd") return { error: "不明な操作です。" };

  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const name = String(form.get("name") ?? "").trim();
  const contactInput = String(form.get("contact") ?? "").trim();
  const party = String(form.get("party") ?? DEFAULT_PARTY) as PartyStatus;
  const note = String(form.get("note") ?? "").trim();

  if (!EMAIL_RE.test(email)) return { error: "メールアドレスの形式が正しくありません。" };

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
  if (errors.length > 0) return { error: errors[0] };

  const contact = contactInput || email;
  const resolvedParty: PartyStatus = event.hasParty ? party : "undecided";

  // Upsert by (event, email) — ADR-008's "代理登録のみ user_id が NULL"
  // dedup key. A second proxyAdd for the same email edits that row
  // (owner-vs-owner or owner-vs-self, "最後に書いた側が勝つ") rather than
  // creating a duplicate; `userId` is left untouched either way.
  const existing = await getApplicationByEventAndEmail(db, event.id, email);
  let applicationId: string;
  if (existing) {
    const updated = await updateApplication(db, existing.id, {
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
    if (!created.ok) return { error: "既に登録されています。" };
    applicationId = created.application.id;
  }

  await Promise.all([
    setApplicationSkills(db, applicationId, skills),
    setAvailability(db, applicationId, availability),
  ]);

  return { ok: true };
}

export default function StaffPage({ loaderData, actionData }: Route.ComponentProps) {
  const { event, applyUrl, roles, timeSlots } = loaderData;
  const error = actionData && "error" in actionData ? actionData.error : undefined;
  // A fresh object only on an actual success — an error response is also a
  // truthy object, so ProxyAddDialog can't tell "an action ran" from
  // "the action succeeded" without this being computed here.
  const succeeded = actionData && "ok" in actionData && actionData.ok ? actionData : undefined;

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-6 lg:p-10">
      <div>
        <h1 className="text-2xl font-bold">{event.name}</h1>
        <p className="text-sm text-neutral-600">募集・スタッフ</p>
      </div>

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
          error={error}
          succeeded={succeeded}
        />
      </section>
    </main>
  );
}
