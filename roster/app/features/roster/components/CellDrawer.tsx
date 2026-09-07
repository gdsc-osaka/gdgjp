import { useEffect, useRef } from "react";
import { Form } from "react-router";
import type { StaffCellCandidate } from "../grid";

export type CellDrawerSelection = {
  applicationId: string;
  applicationName: string;
  slotId: string;
  slotLabel: string;
};

const NEW_MAX_DEFAULT = 99;

/**
 * The staff × slot cell editor (docs/roster/07-roster-manual-edit.md
 * "Design" §5a): "そのスタッフのその枠をどこに割り当てるか." Every candidate
 * comes from `grid.ts#buildStaffCellCandidates`, which already ran
 * `hardViolations` — this component only renders the result, it never
 * decides whether a placement is safe.
 *
 * **Warn-and-allow, not warn-and-block**: a candidate with warnings still
 * gets a normal, always-enabled "割り当てる" submit button
 * (docs/roster/index.md §5.1: "手動編集ではこれらを警告のうえ許可する" — the
 * asymmetry with auto-generation is deliberate, do not disable this button
 * when warnings exist).
 */
export function CellDrawer({
  selection,
  current,
  candidates,
  trackNameById,
  roleNameById,
  error,
  succeeded,
  onClose,
}: {
  selection: CellDrawerSelection | null;
  current: { trackId: string; roleId: string } | null;
  candidates: readonly StaffCellCandidate[];
  trackNameById: ReadonlyMap<string, string>;
  roleNameById: ReadonlyMap<string, string>;
  error?: string;
  /** A fresh truthy value only on a successful assign/unassign — see `StaffDrawer`'s identical contract. */
  succeeded: unknown;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (selection) dialogRef.current?.showModal();
  }, [selection]);

  useEffect(() => {
    if (succeeded) dialogRef.current?.close();
  }, [succeeded]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="cell-drawer-title"
      className="roster-drawer"
    >
      {selection ? (
        <div className="max-h-[85vh] space-y-4 overflow-y-auto p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-neutral-500">{selection.slotLabel}</p>
              <h3 id="cell-drawer-title" className="text-lg font-bold">
                {selection.applicationName}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="text-sm underline"
            >
              閉じる
            </button>
          </div>

          {error ? (
            <p role="alert" className="text-sm font-medium text-gdg-red">
              {error}
            </p>
          ) : null}

          {current ? (
            <div className="flex items-center justify-between rounded-xl border-2 border-black bg-neutral-50 p-3">
              <p className="text-sm">
                現在: {trackNameById.get(current.trackId) ?? current.trackId} /{" "}
                {roleNameById.get(current.roleId) ?? current.roleId}
              </p>
              <Form method="post">
                <input type="hidden" name="intent" value="unassign" />
                <input type="hidden" name="applicationId" value={selection.applicationId} />
                <input type="hidden" name="slotId" value={selection.slotId} />
                <button type="submit" className="text-sm font-medium text-gdg-red underline">
                  外す
                </button>
              </Form>
            </div>
          ) : (
            <p className="text-sm text-neutral-600">この枠には割り当てられていません。</p>
          )}

          <ul className="space-y-2">
            {candidates.map((c) => {
              const isCurrent = current?.trackId === c.trackId && current?.roleId === c.roleId;
              return (
                <li
                  key={`${c.trackId}:${c.roleId}`}
                  className="rounded-xl border-2 border-black p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-bold">
                        {trackNameById.get(c.trackId) ?? c.trackId} /{" "}
                        {roleNameById.get(c.roleId) ?? c.roleId}
                      </p>
                      <p className="text-xs text-neutral-500">
                        人数 {c.current}/{c.demand.ideal}
                        {c.demand.leadMin > 0
                          ? ` ・ リード ${c.leadCurrent}/${c.demand.leadMin}`
                          : ""}
                        {c.demand.newMax < NEW_MAX_DEFAULT
                          ? ` ・ 初参加 ${c.newCurrent}/${c.demand.newMax}`
                          : ""}
                      </p>
                    </div>
                    {isCurrent ? (
                      <span className="text-xs font-bold text-gdg-blue">現在の割当</span>
                    ) : (
                      <Form method="post">
                        <input type="hidden" name="intent" value="assign" />
                        <input type="hidden" name="applicationId" value={selection.applicationId} />
                        <input type="hidden" name="slotId" value={selection.slotId} />
                        <input type="hidden" name="trackId" value={c.trackId} />
                        <input type="hidden" name="roleId" value={c.roleId} />
                        <button
                          type="submit"
                          className="rounded-full border-2 border-black bg-gdg-blue px-3 py-1 text-xs font-bold text-white transition hover:brightness-95"
                        >
                          割り当てる
                        </button>
                      </Form>
                    )}
                  </div>
                  {c.warnings.length > 0 ? (
                    <ul className="mt-2 space-y-0.5 text-xs text-gdg-red">
                      {c.warnings.map((w) => (
                        <li key={w}>⚠ {w}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </dialog>
  );
}
