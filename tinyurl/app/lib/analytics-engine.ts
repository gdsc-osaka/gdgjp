export type AeRow = Record<string, string | number | null>;

type AeResponse = {
  meta: { name: string; type: string }[];
  data: AeRow[];
  rows: number;
};

const DATASET = "tinyurl_clicks";
const CACHE_TTL_MS = 60_000;

type CacheEntry = { at: number; rows: AeRow[] };
const cache = new Map<string, CacheEntry>();

export function clearAeCache(): void {
  cache.clear();
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function intOrThrow(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer (got ${value})`);
  }
  return value;
}

export type AeEnv = {
  CF_ACCOUNT_ID: string;
  CF_AE_API_TOKEN: string;
};

export async function aeQuery(env: AeEnv, sql: string): Promise<AeRow[]> {
  const now = Date.now();
  const cached = cache.get(sql);
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.rows;

  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CF_AE_API_TOKEN}`,
      "Content-Type": "text/plain",
    },
    body: sql,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Analytics Engine query failed (${response.status}): ${text}`);
  }
  const json = (await response.json()) as AeResponse;
  cache.set(sql, { at: now, rows: json.data ?? [] });
  return json.data ?? [];
}

export type HourlyPoint = { hour: string; clicks: number };

export function hourlySql(linkIds: number[] | "all", days = 7): string {
  const d = intOrThrow(days, "days");
  const filter = linkIdsFilter(linkIds);
  return `SELECT toStartOfHour(timestamp) AS hour, count() AS clicks
FROM ${DATASET}
WHERE ${filter} AND timestamp > now() - INTERVAL '${d}' DAY
GROUP BY hour
ORDER BY hour`;
}

export async function hourlyClicks(
  env: AeEnv,
  linkIds: number[] | "all",
  days = 7,
): Promise<HourlyPoint[]> {
  const rows = await aeQuery(env, hourlySql(linkIds, days));
  return rows.map((r) => ({
    hour: String(r.hour ?? ""),
    clicks: Number(r.clicks ?? 0),
  }));
}

export type TopBlob =
  | "slug"
  | "country"
  | "region"
  | "city"
  | "continent"
  | "referer"
  | "browser"
  | "os"
  | "device";

const BLOB_INDEX: Record<TopBlob, number> = {
  slug: 1,
  country: 2,
  region: 3,
  city: 4,
  continent: 5,
  referer: 6,
  browser: 7,
  os: 8,
  device: 9,
};

export type TopRow = { name: string; clicks: number };

export function topSql(field: TopBlob, linkIds: number[] | "all", limit = 10, days = 7): string {
  const blob = `blob${BLOB_INDEX[field]}`;
  const lim = intOrThrow(limit, "limit");
  const d = intOrThrow(days, "days");
  const filter = linkIdsFilter(linkIds);
  return `SELECT ${blob} AS name, count() AS clicks
FROM ${DATASET}
WHERE ${filter} AND timestamp > now() - INTERVAL '${d}' DAY
GROUP BY name
ORDER BY clicks DESC
LIMIT ${lim}`;
}

export async function topByBlob(
  env: AeEnv,
  field: TopBlob,
  linkIds: number[] | "all",
  limit = 10,
  days = 7,
): Promise<TopRow[]> {
  const rows = await aeQuery(env, topSql(field, linkIds, limit, days));
  return rows.map((r) => ({
    name: String(r.name ?? "") || "(unknown)",
    clicks: Number(r.clicks ?? 0),
  }));
}

export function clicksByLinkIdSql(linkIds: number[], days = 7): string {
  const d = intOrThrow(days, "days");
  const filter = linkIdsFilter(linkIds);
  return `SELECT index1 AS linkId, count() AS clicks
FROM ${DATASET}
WHERE ${filter} AND timestamp > now() - INTERVAL '${d}' DAY
GROUP BY linkId`;
}

export async function clicksByLinkId(
  env: AeEnv,
  linkIds: number[],
  days = 7,
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (linkIds.length === 0) return map;
  const rows = await aeQuery(env, clicksByLinkIdSql(linkIds, days));
  for (const row of rows) {
    const id = Number(row.linkId);
    const clicks = Number(row.clicks ?? 0);
    if (Number.isFinite(id)) map.set(id, clicks);
  }
  return map;
}

export function totalSql(linkIds: number[] | "all", days = 7): string {
  const d = intOrThrow(days, "days");
  const filter = linkIdsFilter(linkIds);
  return `SELECT count() AS clicks
FROM ${DATASET}
WHERE ${filter} AND timestamp > now() - INTERVAL '${d}' DAY`;
}

export async function totalClicks(
  env: AeEnv,
  linkIds: number[] | "all",
  days = 7,
): Promise<number> {
  const rows = await aeQuery(env, totalSql(linkIds, days));
  return Number(rows[0]?.clicks ?? 0);
}

function linkIdsFilter(linkIds: number[] | "all"): string {
  if (linkIds === "all") return "1=1";
  if (linkIds.length === 0) return "1=0";
  const ids = linkIds.map((id) => quote(String(intOrThrow(id, "linkId")))).join(", ");
  return `index1 IN (${ids})`;
}
