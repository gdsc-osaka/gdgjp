import { useMemo } from "react";
import { LEVEL_LABELS } from "~/features/applications/types";
import type { Assignments } from "~/features/solver/types";
import { assignmentKey } from "~/features/solver/types";
import type { StaffGridColumn } from "../grid";

export type { StaffGridColumn } from "../grid";
export type StaffGridSlot = { id: string; start: string; end: string };

type TrackInfo = { name: string; color: string };

/**
 * The default view on `/e/:id/roster`: vertical = time, horizontal = staff
 * (docs/roster/07-roster-manual-edit.md "Design" §3a). One column per staff
 * member's whole day; reading across a row answers "who is where right now".
 *
 * A cell shows the role name and the track name (never the experience
 * level — that's the column header's job, ADR-005 in spirit even though
 * this is the owner-only screen) with the track's color as a background
 * tint so a same-track run reads as a solid stripe down the column.
 */
export function StaffGrid({
  timeSlots,
  columns,
  assignments,
  trackById,
  roleNameById,
  onCellClick,
}: {
  timeSlots: readonly StaffGridSlot[];
  columns: readonly StaffGridColumn[];
  assignments: Assignments;
  trackById: ReadonlyMap<string, TrackInfo>;
  roleNameById: ReadonlyMap<string, string>;
  onCellClick: (applicationId: string, slotId: string) => void;
}) {
  const byAppSlot = useMemo(() => {
    const map = new Map<string, { trackId: string; roleId: string }>();
    for (const [key, value] of assignments) {
      map.set(key, { trackId: value.trackId, roleId: value.roleId });
    }
    return map;
  }, [assignments]);

  if (columns.length === 0) {
    return (
      <p className="text-sm text-neutral-600">
        表示できるスタッフがいません。募集期間中に登録があるか確認してください。
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label="トラック凡例">
        {[...trackById.values()].map((track) => (
          <span key={track.name} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-sm border border-border"
              style={{ backgroundColor: `${track.color}40` }}
            />
            {track.name}
          </span>
        ))}
      </div>
      <div className="data-grid-wrap">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 border-b-2 border-black bg-neutral-50 p-2 text-left">
                時間枠
              </th>
              {columns.map((col) => (
                <th
                  key={col.applicationId}
                  className="border-b-2 border-black bg-neutral-50 p-2 text-left align-top font-medium"
                >
                  <div className={col.withdrawn ? "text-gdg-red line-through" : undefined}>
                    {col.name}
                    {col.withdrawn ? "（辞退）" : ""}
                  </div>
                  {col.skills.length > 0 ? (
                    <ul className="mt-1 flex flex-wrap gap-1">
                      {col.skills.map((s) => (
                        <li
                          key={s.roleName}
                          className="rounded-full bg-neutral-100 px-1.5 text-[10px] font-bold text-neutral-600"
                        >
                          {s.roleName}:{LEVEL_LABELS[s.level]}
                        </li>
                      ))}
                    </ul>
                  ) : null}
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
                  const value = byAppSlot.get(assignmentKey(col.applicationId, slot.id));
                  const availability = col.availability[slot.id] ?? "x";
                  const softUsed = Boolean(value) && availability === "d";
                  const violation = Boolean(value) && availability === "x";
                  const track = value ? trackById.get(value.trackId) : undefined;
                  const roleName = value ? (roleNameById.get(value.roleId) ?? value.roleId) : "";
                  return (
                    <td key={col.applicationId} className="p-1">
                      <button
                        type="button"
                        onClick={() => onCellClick(col.applicationId, slot.id)}
                        aria-label={`${col.name} / ${slot.start}–${slot.end}${
                          track ? `：${track.name} ${roleName}` : "：空き"
                        }`}
                        className={`flex h-full min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-lg border p-1 text-center transition hover:brightness-95 ${
                          violation
                            ? "border-2 border-gdg-red"
                            : softUsed
                              ? "border-2 border-dashed border-neutral-500"
                              : "border-neutral-200"
                        }`}
                        style={track ? { backgroundColor: `${track.color}26` } : undefined}
                      >
                        {track ? (
                          <>
                            <span className="text-xs font-bold">{roleName}</span>
                            <span className="text-[10px] text-neutral-600">{track.name}</span>
                          </>
                        ) : null}
                        {violation ? (
                          <span className="text-[10px] font-bold text-gdg-red">稼働×</span>
                        ) : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
