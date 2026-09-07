import {
  AVAILABILITY_HINT,
  AVAILABILITY_LABELS,
  AVAILABILITY_VALUES,
  type AvailabilityValue,
} from "~/features/applications/types";

export type AvailabilityGridSlot = {
  id: string;
  start: string;
  end: string;
  phaseName: string | null;
};

/**
 * The ○/△/× grid over an event's time slots (docs/roster/04-applications.md
 * "Design" §2). Shortcut buttons ("終日○" etc.) exist because filling a
 * radio group per slot by hand for a 10+ slot event is the input-load
 * problem the stage doc calls out explicitly — `onBulkChange` lets the
 * caller (`ApplyForm`) set every slot from one function of the slot.
 *
 * The "△ is only used when ○ doesn't fill the slot" caveat is shown
 * verbatim (`AVAILABILITY_HINT.d`) per the stage doc's warning that leaving
 * it unsaid makes everyone answer △ and breaks the solver's cost model.
 */
export function AvailabilityGrid({
  timeSlots,
  values,
  onChange,
  onBulkChange,
}: {
  timeSlots: readonly AvailabilityGridSlot[];
  values: Readonly<Record<string, AvailabilityValue>>;
  onChange: (timeSlotId: string, value: AvailabilityValue) => void;
  onBulkChange: (compute: (slot: AvailabilityGridSlot) => AvailabilityValue) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <ShortcutButton label="終日 ○" onClick={() => onBulkChange(() => "o")} />
        <ShortcutButton label="すべて ×" onClick={() => onBulkChange(() => "x")} />
        <ShortcutButton
          label="午前のみ"
          onClick={() => onBulkChange((slot) => (slot.start < "12:00" ? "o" : "x"))}
        />
        <ShortcutButton
          label="午後のみ"
          onClick={() => onBulkChange((slot) => (slot.start >= "12:00" ? "o" : "x"))}
        />
      </div>

      <p className="text-xs text-neutral-600">○ 可能 / △ {AVAILABILITY_HINT.d} / × 不可</p>

      <ul className="space-y-2">
        {timeSlots.map((slot) => (
          <li
            key={slot.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
          >
            <span>
              <span className="font-medium">
                {slot.start}–{slot.end}
              </span>
              {slot.phaseName ? (
                <span className="ml-2 text-sm text-neutral-500">{slot.phaseName}</span>
              ) : null}
            </span>
            <div className="inline-flex rounded-md bg-muted p-0.5">
              {AVAILABILITY_VALUES.map((value) => (
                <label
                  key={value}
                  className={`availability-option cursor-pointer rounded-sm px-3 py-1 text-center text-sm font-semibold transition ${
                    values[slot.id] === value
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <input
                    type="radio"
                    name={`avail_${slot.id}`}
                    value={value}
                    checked={values[slot.id] === value}
                    onChange={() => onChange(slot.id, value)}
                    className="sr-only"
                  />
                  {AVAILABILITY_LABELS[value]}
                </label>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ShortcutButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border-2 border-black bg-white px-4 py-1.5 text-sm font-bold transition hover:bg-neutral-100"
    >
      {label}
    </button>
  );
}
