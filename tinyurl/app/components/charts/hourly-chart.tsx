import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HourlyPoint } from "~/lib/analytics-engine";

function formatHour(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
  });
}

export function HourlyChart({ data }: { data: HourlyPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No clicks in this range yet.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={256}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="hour"
          tickFormatter={formatHour}
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          stroke="var(--color-border)"
          minTickGap={32}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          stroke="var(--color-border)"
          width={32}
        />
        <Tooltip
          labelFormatter={formatHour}
          contentStyle={{
            background: "var(--color-popover)",
            border: "1px solid var(--color-border)",
            borderRadius: "0.375rem",
            fontSize: 12,
          }}
        />
        <Line
          type="monotone"
          dataKey="clicks"
          stroke="var(--color-gdg-blue)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
