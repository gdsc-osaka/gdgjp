import type { MatrixCell } from "../matrix";

// A `newMax` at (or above) the schema default effectively means "no cap" —
// the badge would fire on every single cell otherwise, since the column
// default is 99 (docs/roster/index.md §4 demands schema).
const NEW_MAX_DEFAULT = 99;

/**
 * One cell of the demand matrix on `/e/:id/design`
 * (docs/roster/03-demand-input.md "Design" §4). A button (not a link) so it
 * behaves inside the surrounding `<table>` and stays keyboard-reachable;
 * clicking it opens `DemandDrawer` for this (row, track, role).
 */
export function DemandCell({
  cell,
  label,
  onClick,
}: {
  cell: MatrixCell;
  label: string;
  onClick: () => void;
}) {
  if (cell.kind === "empty") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${label}：需要なし。クリックして追加`}
        className="flex h-full w-full items-center justify-center rounded-lg p-2 text-neutral-400 transition hover:bg-neutral-100"
      >
        –
      </button>
    );
  }

  const { min, ideal, leadMin, newMax } = cell.value;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}：最小${min}、理想${ideal}${cell.uniform ? "" : "（時間枠ごとに異なる）"}`}
      className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-black bg-white p-2 transition hover:bg-neutral-50"
    >
      <span className="font-bold">
        {min}/{ideal}
        {cell.uniform ? "" : "*"}
      </span>
      {(leadMin > 0 || newMax < NEW_MAX_DEFAULT) && (
        <span className="flex flex-wrap justify-center gap-1">
          {leadMin > 0 ? (
            <span className="rounded-full bg-gdg-blue/10 px-1.5 text-[11px] font-bold text-gdg-blue">
              L≥{leadMin}
            </span>
          ) : null}
          {newMax < NEW_MAX_DEFAULT ? (
            <span className="rounded-full bg-gdg-yellow/20 px-1.5 text-[11px] font-bold text-neutral-700">
              新≤{newMax}
            </span>
          ) : null}
        </span>
      )}
    </button>
  );
}
