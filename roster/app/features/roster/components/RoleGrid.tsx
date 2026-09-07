import { useMemo } from "react";
import type { Assignments, Demand } from "~/features/solver/types";
import { buildGridColumns, buildRoleGridColumn, gridColumnKey } from "../grid";

export type RoleGridSlot = { id: string; idx: number; start: string; end: string };
type TrackInfo = { id: string; name: string; color: string; sortOrder: number };
type RoleInfo = { id: string; name: string; sortOrder: number };

/**
 * The role-view on `/e/:id/roster`: vertical = time, horizontal =
 * (track × role) (docs/roster/07-roster-manual-edit.md "Design" §3b).
 * Reading a column answers "who is on reception at Track A from when to
 * when". Consecutive slots with the same lineup AND the same demand merge
 * into one spanning cell via `grid.ts#buildRoleGridColumn` — clicking a
 * merged cell selects the WHOLE range for `onSelectCell` (the caller opens
 * `DemandCellDrawer` and, on "add", places the chosen candidate into every
 * slot in the range at once — "一括で配置する", never one slot at a time).
 *
 * `readOnly` (docs/roster/09-share-public-views.md "Design" §2b) is Stage
 * 09's public role view reusing this exact component rather than forking it:
 * cells render as plain non-interactive containers (no `onSelectCell` call,
 * no hover affordance) and the per-cell `count/ideal` badge is hidden
 * outright, because the public caller has no real demand numbers to show —
 * it only knows "who is actually here", synthesized into a `demands`-shaped
 * map purely to reuse `buildGridColumns`/`buildRoleGridColumn`'s column
 * derivation and merge-by-membership logic (`app/routes/r.$token.tsx`).
 * Everything else (the merge algorithm, the member list, colors) is
 * identical between the two callers.
 */
export function RoleGrid({
  timeSlots,
  tracks,
  roles,
  demands,
  assignments,
  nameById,
  onSelectCell,
  readOnly = false,
}: {
  timeSlots: readonly RoleGridSlot[];
  tracks: readonly TrackInfo[];
  roles: readonly RoleInfo[];
  demands: ReadonlyMap<string, Demand>;
  assignments: Assignments;
  nameById: ReadonlyMap<string, string>;
  onSelectCell?: (trackId: string, roleId: string, slotIds: string[]) => void;
  readOnly?: boolean;
}) {
  const columns = useMemo(() => buildGridColumns(demands, tracks, roles), [demands, tracks, roles]);
  const trackById = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);
  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  const columnCells = useMemo(
    () =>
      new Map(
        columns.map((col) => [
          gridColumnKey(col.trackId, col.roleId),
          buildRoleGridColumn(timeSlots, col.trackId, col.roleId, assignments, demands),
        ]),
      ),
    [columns, timeSlots, assignments, demands],
  );

  if (columns.length === 0) {
    return (
      <p className="text-sm text-neutral-600">
        {readOnly ? "誰も割り当てられていません。" : "需要が設定されていません。"}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border-2 border-black">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 border-b-2 border-black bg-neutral-50 p-2 text-left">
              時間枠
            </th>
            {columns.map((col) => {
              const track = trackById.get(col.trackId);
              return (
                <th
                  key={gridColumnKey(col.trackId, col.roleId)}
                  className="border-b-2 border-black bg-neutral-50 p-2 text-left font-medium"
                >
                  <div>{roleById.get(col.roleId)?.name ?? col.roleId}</div>
                  <div className="text-xs font-normal text-neutral-500">
                    {track?.name ?? col.trackId}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {timeSlots.map((slot, rowIdx) => (
            <tr key={slot.id} className="border-b border-neutral-200 last:border-0">
              <th scope="row" className="sticky left-0 bg-white p-2 text-left font-medium">
                {slot.start}–{slot.end}
              </th>
              {columns.map((col) => {
                const colKey = gridColumnKey(col.trackId, col.roleId);
                const cell = columnCells.get(colKey)?.[rowIdx];
                if (!cell || cell.kind === "continued") return null;
                const rangeSlotIds = timeSlots.slice(rowIdx, rowIdx + cell.span).map((s) => s.id);
                const label =
                  cell.span > 1
                    ? `${slot.start}–${timeSlots[rowIdx + cell.span - 1].end}`
                    : `${slot.start}–${slot.end}`;
                const ariaLabel = `${label} / ${trackById.get(col.trackId)?.name ?? col.trackId} / ${
                  roleById.get(col.roleId)?.name ?? col.roleId
                }`;
                const cellBody = (
                  <>
                    {!readOnly ? (
                      <span className="text-xs font-bold text-neutral-500">
                        {cell.demand ? `${cell.memberIds.length}/${cell.demand.ideal}` : "需要なし"}
                      </span>
                    ) : null}
                    <ul className="space-y-0.5">
                      {cell.memberIds.length === 0 ? (
                        <li className="text-neutral-400">空き</li>
                      ) : (
                        cell.memberIds.map((id) => <li key={id}>{nameById.get(id) ?? id}</li>)
                      )}
                    </ul>
                  </>
                );
                return (
                  <td key={colKey} rowSpan={cell.span} className="p-1 align-top">
                    {readOnly ? (
                      <div
                        aria-label={ariaLabel}
                        className="flex h-full w-full min-h-12 flex-col items-start gap-1 rounded-lg border-2 border-black bg-white p-2 text-left"
                      >
                        {cellBody}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectCell?.(col.trackId, col.roleId, rangeSlotIds)}
                        aria-label={ariaLabel}
                        className="flex h-full w-full min-h-12 flex-col items-start gap-1 rounded-lg border-2 border-black bg-white p-2 text-left transition hover:bg-neutral-50"
                      >
                        {cellBody}
                      </button>
                    )}
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
