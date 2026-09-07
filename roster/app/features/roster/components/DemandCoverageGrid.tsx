import { useMemo } from "react";
import type { Assignments, Demand, Report } from "~/features/solver/types";
import { demandKey } from "~/features/solver/types";
import {
  type CellReport,
  VIOLATION_LABELS,
  buildGridColumns,
  gridColumnKey,
  groupAssignmentsByCell,
  indexReportByCell,
} from "../grid";

export type CoverageSlot = { id: string; start: string; end: string };
type TrackInfo = { id: string; name: string; color: string; sortOrder: number };
type RoleInfo = { id: string; name: string; sortOrder: number };

/**
 * The coverage view on `/e/:id/roster`: vertical = time, horizontal =
 * (track × role) — the same axis as `RoleGrid` so the two views read
 * side-by-side (docs/roster/07-roster-manual-edit.md "Design" §3c). Each
 * cell shows 現在/理想 and the lead/newcomer condition, colored by
 * `evaluate()`'s own `Report` (via `grid.ts#indexReportByCell`) — never
 * re-judged here. Unlike `RoleGrid`, cells are never merged: coverage is a
 * per-slot fact, not a "who is here" lineup that can repeat unchanged.
 */
export function DemandCoverageGrid({
  timeSlots,
  tracks,
  roles,
  demands,
  assignments,
  report,
  onSelectCell,
}: {
  timeSlots: readonly CoverageSlot[];
  tracks: readonly TrackInfo[];
  roles: readonly RoleInfo[];
  demands: ReadonlyMap<string, Demand>;
  assignments: Assignments;
  report: Report;
  onSelectCell: (trackId: string, roleId: string, slotIds: string[]) => void;
}) {
  const columns = useMemo(() => buildGridColumns(demands, tracks, roles), [demands, tracks, roles]);
  const trackById = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);
  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const membersByCell = useMemo(() => groupAssignmentsByCell(assignments), [assignments]);
  const reportByCell = useMemo(() => indexReportByCell(report), [report]);

  if (columns.length === 0) {
    return <p className="text-sm text-neutral-600">需要が設定されていません。</p>;
  }

  return (
    <div className="data-grid-wrap">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 border-b-2 border-black bg-neutral-50 p-2 text-left">
              時間枠
            </th>
            {columns.map((col) => (
              <th
                key={gridColumnKey(col.trackId, col.roleId)}
                className="border-b-2 border-black bg-neutral-50 p-2 text-left font-medium"
              >
                <div>{roleById.get(col.roleId)?.name ?? col.roleId}</div>
                <div className="text-xs font-normal text-neutral-500">
                  {trackById.get(col.trackId)?.name ?? col.trackId}
                </div>
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
                const key = demandKey(slot.id, col.trackId, col.roleId);
                const demand = demands.get(key);
                const current = membersByCell.get(key)?.length ?? 0;
                const cellReport = reportByCell.get(key);
                return (
                  <td key={gridColumnKey(col.trackId, col.roleId)} className="p-1">
                    <button
                      type="button"
                      onClick={() => onSelectCell(col.trackId, col.roleId, [slot.id])}
                      aria-label={coverageLabel(demand, current, cellReport)}
                      className={`flex h-full min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-lg border-2 p-1 text-center transition hover:brightness-95 ${coverageClass(
                        demand,
                        current,
                        cellReport,
                      )}`}
                    >
                      {demand ? (
                        <>
                          <span className="font-bold">
                            {current}/{demand.ideal}
                          </span>
                          {demand.leadMin > 0 ? (
                            <span className="text-[10px]">
                              L{cellReport?.leadShort ? "不足" : "OK"}
                            </span>
                          ) : null}
                          {cellReport && cellReport.violations.length > 0 ? (
                            <span className="text-[10px] font-bold text-gdg-red">
                              {VIOLATION_LABELS[cellReport.violations[0]]}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-neutral-300">–</span>
                      )}
                    </button>
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

function coverageClass(
  demand: Demand | undefined,
  current: number,
  cellReport?: CellReport,
): string {
  if (!demand) return "border-transparent";
  if ((cellReport?.headcountShort ?? 0) > 0) return "border-gdg-red bg-gdg-red/10";
  if ((cellReport?.violations.length ?? 0) > 0) return "border-gdg-red bg-gdg-red/5";
  if ((cellReport?.leadShort ?? 0) > 0) return "border-gdg-yellow bg-gdg-yellow/20";
  if (current >= demand.ideal) return "border-black bg-white";
  return "border-neutral-300 bg-white";
}

function coverageLabel(
  demand: Demand | undefined,
  current: number,
  cellReport?: CellReport,
): string {
  if (!demand) return "需要なし";
  const parts = [`現在${current}名 / 理想${demand.ideal}名`];
  if (cellReport?.headcountShort) parts.push(`頭数${cellReport.headcountShort}名不足`);
  if (cellReport?.leadShort) parts.push(`経験者${cellReport.leadShort}名不足`);
  for (const v of cellReport?.violations ?? []) parts.push(VIOLATION_LABELS[v]);
  return parts.join("、");
}
