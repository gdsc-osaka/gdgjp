import { useState } from "react";
import { Form } from "react-router";
import {
  type AvailabilityValue,
  DEFAULT_LEVEL,
  DEFAULT_PARTY,
  DEFAULT_PREF,
  type Level,
  PARTY_LABELS,
  PARTY_STATUSES,
  type PartyStatus,
  type Pref,
} from "~/features/applications/types";
import { AvailabilityGrid, type AvailabilityGridSlot } from "./AvailabilityGrid";
import { RoleSkillRow } from "./RoleSkillRow";

export type ApplyFormOwn = {
  name: string;
  contact: string;
  party: PartyStatus;
  note: string;
  withdrawn: boolean;
  skills: { roleId: string; level: Level; pref: Pref }[];
  availability: { timeSlotId: string; value: AvailabilityValue }[];
};

type SkillState = { selected: boolean; level: Level; pref: Pref };

/**
 * The self-registration / self-edit form on `/apply/:token`
 * (docs/roster/04-applications.md "Design" §2). `own` is `null` for a
 * first-time registration and populated for an edit — same fields either
 * way, since the route always resolves to one of "create" or "update" and
 * never shows a form for someone else's application (the loader only ever
 * passes the viewer's own data, see `apply.$token.tsx`).
 */
export function ApplyForm({
  hasParty,
  roles,
  timeSlots,
  own,
  defaultName,
  accountEmail,
  error,
}: {
  hasParty: boolean;
  roles: { id: string; name: string }[];
  timeSlots: AvailabilityGridSlot[];
  own: ApplyFormOwn | null;
  defaultName: string;
  accountEmail: string;
  error?: string;
}) {
  const [skills, setSkills] = useState<Record<string, SkillState>>(() =>
    Object.fromEntries(
      roles.map((role) => {
        const existing = own?.skills.find((s) => s.roleId === role.id);
        const state: SkillState = existing
          ? { selected: true, level: existing.level, pref: existing.pref }
          : { selected: false, level: DEFAULT_LEVEL, pref: DEFAULT_PREF };
        return [role.id, state];
      }),
    ),
  );
  const [availability, setAvailability] = useState<Record<string, AvailabilityValue>>(() =>
    Object.fromEntries(
      timeSlots.map((slot) => [
        slot.id,
        own?.availability.find((a) => a.timeSlotId === slot.id)?.value ?? "o",
      ]),
    ),
  );

  return (
    <Form method="post" className="space-y-6">
      {error ? (
        <p role="alert" className="text-sm font-medium text-gdg-red">
          {error}
        </p>
      ) : null}

      {own?.withdrawn ? (
        <p className="rounded-xl border-2 border-black bg-neutral-100 p-3 text-sm">
          この登録は辞退済みです。内容を保存すると再度有効になります。
        </p>
      ) : null}

      <label className="block space-y-1">
        <span className="text-sm font-medium">表示名</span>
        <input
          name="name"
          required
          defaultValue={own?.name ?? defaultName}
          className="w-full rounded-xl border-2 border-black bg-white p-3 outline-none focus:ring-4 focus:ring-gdg-blue/40"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">当日の連絡手段（任意）</span>
        <input
          name="contact"
          defaultValue={own?.contact ?? ""}
          placeholder={`未入力の場合は ${accountEmail} を使用します`}
          className="w-full rounded-xl border-2 border-black bg-white p-3 outline-none focus:ring-4 focus:ring-gdg-blue/40"
        />
      </label>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">担当できる役割</legend>
        <ul className="space-y-2">
          {roles.map((role) => (
            <RoleSkillRow
              key={role.id}
              role={role}
              selected={skills[role.id]?.selected ?? false}
              level={skills[role.id]?.level ?? DEFAULT_LEVEL}
              pref={skills[role.id]?.pref ?? DEFAULT_PREF}
              onSelectedChange={(selected) =>
                setSkills((s) => ({ ...s, [role.id]: { ...s[role.id], selected } }))
              }
              onLevelChange={(level) =>
                setSkills((s) => ({ ...s, [role.id]: { ...s[role.id], level } }))
              }
              onPrefChange={(pref) =>
                setSkills((s) => ({ ...s, [role.id]: { ...s[role.id], pref } }))
              }
            />
          ))}
        </ul>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">稼働可能時間</legend>
        <AvailabilityGrid
          timeSlots={timeSlots}
          values={availability}
          onChange={(timeSlotId, value) => setAvailability((a) => ({ ...a, [timeSlotId]: value }))}
          onBulkChange={(compute) =>
            setAvailability(Object.fromEntries(timeSlots.map((slot) => [slot.id, compute(slot)])))
          }
        />
      </fieldset>

      {hasParty ? (
        <label className="block space-y-1">
          <span className="text-sm font-medium">懇親会</span>
          <select
            name="party"
            defaultValue={own?.party ?? DEFAULT_PARTY}
            className="w-full rounded-xl border-2 border-black bg-white p-3 outline-none focus:ring-4 focus:ring-gdg-blue/40"
          >
            {PARTY_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PARTY_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="block space-y-1">
        <span className="text-sm font-medium">備考（任意）</span>
        <textarea
          name="note"
          rows={3}
          defaultValue={own?.note ?? ""}
          className="w-full rounded-xl border-2 border-black bg-white p-3 outline-none focus:ring-4 focus:ring-gdg-blue/40"
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="intent"
          value="save"
          className="rounded-full border-2 border-black bg-gdg-blue px-6 py-2.5 font-bold text-white transition hover:brightness-95"
        >
          {own ? "登録内容を更新" : "登録する"}
        </button>
        {own ? (
          <button
            type="submit"
            name="intent"
            value="withdraw"
            formNoValidate
            className="rounded-full border-2 border-black bg-white px-6 py-2.5 font-bold text-gdg-red transition hover:bg-neutral-100"
          >
            辞退する
          </button>
        ) : null}
      </div>
    </Form>
  );
}
