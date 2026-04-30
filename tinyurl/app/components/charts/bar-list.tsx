import type { TopRow } from "~/lib/analytics-engine";

export function BarList({ rows, emptyLabel }: { rows: TopRow[]; emptyLabel?: string }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{emptyLabel ?? "No data in this range."}</p>
    );
  }
  const max = Math.max(...rows.map((r) => r.clicks), 1);
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const pct = (r.clicks / max) * 100;
        return (
          <li key={r.name} className="relative">
            <div
              className="absolute inset-y-0 left-0 rounded bg-gdg-blue/15"
              style={{ width: `${pct}%` }}
              aria-hidden
            />
            <div className="relative flex items-center justify-between px-2 py-1.5 text-sm">
              <span className="truncate" title={r.name}>
                {r.name}
              </span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {r.clicks.toLocaleString()}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
