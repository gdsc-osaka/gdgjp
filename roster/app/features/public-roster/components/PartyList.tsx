import { PARTY_LABELS, PARTY_STATUSES, type PartyStatus } from "~/features/applications/types";
import type { PublicStaff } from "../types";

/**
 * The public party (懇親会) tab (docs/roster/09-share-public-views.md
 * "Design" §2d): 3 groups (参加/未定/不参加) with a headcount and names each.
 * The caller (`app/routes/r.$token.tsx`) hides this tab entirely when
 * `event.hasParty` is false — this component doesn't re-check that itself,
 * the same way `RoleGrid` doesn't re-check `canView` either; gating is the
 * route's job, rendering is this component's.
 */
export function PartyList({ staff }: { staff: readonly PublicStaff[] }) {
  const displayOrder: readonly PartyStatus[] = ["yes", "undecided", "no"];
  const groups = new Map<PartyStatus, PublicStaff[]>(PARTY_STATUSES.map((s) => [s, []]));
  for (const member of staff) groups.get(member.party)?.push(member);

  return (
    <div className="space-y-4">
      {displayOrder.map((status) => {
        const members = groups.get(status) ?? [];
        return (
          <section key={status} className="rounded-xl border-2 border-black bg-white p-4">
            <h3 className="font-bold">
              {PARTY_LABELS[status]}（{members.length}人）
            </h3>
            {members.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {members.map((m) => (
                  <li
                    key={m.id}
                    className="rounded-full border-2 border-black bg-white px-3 py-1 text-sm"
                  >
                    {m.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-neutral-500">該当者なし</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
