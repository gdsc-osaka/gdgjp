type LegendTrack = { name: string; color: string };

/**
 * The colour key above a shift grid (`StaffGrid`, `RoleGrid`, and Stage 09's
 * `PublicStaffGrid`). Track colour is the grid's primary encoding, and
 * index.md §6 requires it never be the ONLY encoding — the cells also print
 * the track name — but a key is still what makes a column of tinted blocks
 * readable at a glance.
 *
 * `showAvailabilityStates` is off for the public view on purpose: `o`/`d`/`x`
 * availability never leaves the owner side (ADR-005 / Stage 09's
 * `PublicRosterData` has no `availability` field), so a public legend
 * explaining △ and 違反 would describe styling that page can never render.
 */
export function GridLegend({
  tracks,
  showAvailabilityStates = false,
}: {
  tracks: readonly LegendTrack[];
  showAvailabilityStates?: boolean;
}) {
  return (
    <div className="data-grid-legend" aria-label="凡例">
      {tracks.map((track) => (
        <span key={track.name}>
          <span aria-hidden="true" className="sw" style={{ backgroundColor: `${track.color}40` }} />
          {track.name}
        </span>
      ))}
      {showAvailabilityStates ? (
        <>
          <span>
            <span
              aria-hidden="true"
              className="sw"
              style={{ boxShadow: "inset 0 0 0 2px var(--color-gdg-yellow)" }}
            />
            △（可能なら）の枠を使用
          </span>
          <span>
            <span
              aria-hidden="true"
              className="sw"
              style={{ boxShadow: "inset 0 0 0 2px var(--color-gdg-red)" }}
            />
            条件違反
          </span>
          <span>空欄 = 休憩</span>
        </>
      ) : null}
    </div>
  );
}
