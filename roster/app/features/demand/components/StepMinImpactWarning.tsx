import { useState } from "react";
import { buildSlots } from "~/features/schedule/slots";
import { demandLossOnSlotChange } from "../impact";
import type { Demand } from "../types";

const STEP_OPTIONS = [15, 30, 60] as const;

/**
 * A "what if I changed the step size" preview, independent of the real
 * step-size select in "イベント設定" (docs/roster/03-demand-input.md
 * "Design" §6, manual E2E step 10: "確認するが実行はしない"). Deliberately
 * a separate, non-submitting control rather than wiring a live warning
 * into `~/features/events/components/EventSettingsForm` — that component
 * belongs to Stage 02 and isn't in this stage's Files-to-touch list; see
 * the PR description for this choice.
 *
 * Computed entirely client-side from data the loader already sent down:
 * `buildSlots` (Stage 02, pure) rebuilds the slot grid for the previewed
 * step size, and `demandLossOnSlotChange` (this feature, pure — wraps
 * Stage 02's `reconcileSlotKeys`) reports how many demand rows that would
 * delete. No server round trip needed to preview an edit nobody has
 * submitted yet.
 */
export function StepMinImpactWarning({
  event,
  phases,
  timeSlots,
  demands,
}: {
  event: { startTime: string; endTime: string; stepMin: number };
  phases: { id: string; from: string; to: string }[];
  timeSlots: { id: string; start: string; end: string }[];
  demands: Demand[];
}) {
  const [previewStepMin, setPreviewStepMin] = useState<number>(event.stepMin);

  const impact =
    previewStepMin === event.stepMin
      ? null
      : demandLossOnSlotChange(
          timeSlots,
          buildSlots(
            { start: event.startTime, end: event.endTime, stepMin: previewStepMin },
            phases,
          ),
          demands,
        );

  return (
    <div className="space-y-2 rounded-xl border-2 border-dashed border-neutral-300 p-4">
      <label className="block space-y-1 text-sm">
        <span className="font-medium">刻み幅を変更した場合の影響を確認</span>
        <select
          value={previewStepMin}
          onChange={(e) => setPreviewStepMin(Number(e.target.value))}
          className="w-full max-w-40 rounded-xl border-2 border-black bg-white p-2"
        >
          {STEP_OPTIONS.map((min) => (
            <option key={min} value={min}>
              {min}分
            </option>
          ))}
        </select>
      </label>
      {impact ? (
        impact.lostCount > 0 ? (
          <p role="alert" className="text-sm font-medium text-gdg-red">
            刻み幅を{previewStepMin}分に変更すると、{impact.lostCount}件の需要が失われます。
          </p>
        ) : (
          <p className="text-sm text-neutral-600">この変更で失われる需要はありません。</p>
        )
      ) : null}
    </div>
  );
}
