import { useMemo } from "react";
import { groupAssignmentsByApplication } from "~/features/roster/grid";
import type { Assignments } from "~/features/solver/types";

export type PublicStaffGridSlot = { id: string; start: string; end: string };
export type PublicStaffGridColumn = { id: string; name: string };
type TrackInfo = { name: string; color: string };

/**
 * The public default view (docs/roster/09-share-public-views.md "Design"
 * §2a): vertical = time, horizontal = staff — visually the same shape as
 * Stage 07's owner-only `~/features/roster/components/StaffGrid`, but with
 * no experience-level column header (ADR-005), no availability violation
 * styling (public data has no `availability` at all — that field never
 * leaves `roster.server.ts`), and no click handler (read-only). Reuses
 * `roster/grid.ts#groupAssignmentsByApplication` for the per-application
 * per-slot lookup rather than re-deriving it — the same pure function
 * `StaffGrid` itself is built on top of (`buildStaffColumns`).
 */
export function PublicStaffGrid({
  timeSlots,
  columns,
  assignments,
  trackById,
  roleNameById,
}: {
  timeSlots: readonly PublicStaffGridSlot[];
  columns: readonly PublicStaffGridColumn[];
  assignments: Assignments;
  trackById: ReadonlyMap<string, TrackInfo>;
  roleNameById: ReadonlyMap<string, string>;
}) {
  const byApp = useMemo(() => groupAssignmentsByApplication(assignments), [assignments]);

  if (columns.length === 0) {
    return <p className="text-sm text-neutral-600">表示できるスタッフがいません。</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border-2 border-black">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 border-b-2 border-black bg-neutral-50 p-2 text-left">
              時間枠
            </th>
            {columns.map((col) => (
              <th
                key={col.id}
                className="border-b-2 border-black bg-neutral-50 p-2 text-left font-medium"
              >
                {col.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timeSlots.map((slot) => (
            <tr key={slot.id} className="border-b border-neutral-200 last:border-0">
              <th scope="row" className="sticky left-0 bg-white p-2 text-left font-medium">
                {slot.start}–{slot.end}
              </th>
              {columns.map((col) => {
                const value = byApp.get(col.id)?.get(slot.id);
                const track = value ? trackById.get(value.trackId) : undefined;
                const roleName = value ? (roleNameById.get(value.roleId) ?? value.roleId) : "";
                return (
                  <td key={col.id} className="p-1">
                    <div
                      aria-label={`${col.name} / ${slot.start}–${slot.end}${
                        track ? `：${track.name} ${roleName}` : "：空き"
                      }`}
                      className="flex h-full min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-lg border border-neutral-200 p-1 text-center"
                      style={track ? { backgroundColor: `${track.color}26` } : undefined}
                    >
                      {track ? (
                        <>
                          <span className="text-xs font-bold">{roleName}</span>
                          <span className="text-[10px] text-neutral-600">{track.name}</span>
                        </>
                      ) : null}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
