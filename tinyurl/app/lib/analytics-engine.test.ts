import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  aeQuery,
  clearAeCache,
  hourlyClicks,
  hourlySql,
  topByBlob,
  topSql,
  totalClicks,
  totalSql,
} from "./analytics-engine";

const env = { CF_ACCOUNT_ID: "acc_123", CF_AE_API_TOKEN: "token_abc" };

describe("analytics-engine SQL", () => {
  it("hourlySql for a single link", () => {
    expect(hourlySql([42], 7)).toMatchInlineSnapshot(`
      "SELECT toStartOfHour(timestamp) AS hour, count() AS clicks
      FROM tinyurl_clicks
      WHERE index1 IN ('42') AND timestamp > now() - INTERVAL '7' DAY
      GROUP BY hour
      ORDER BY hour"
    `);
  });

  it("hourlySql for all links", () => {
    expect(hourlySql("all")).toContain("WHERE 1=1");
  });

  it("hourlySql returns no rows when ids list is empty", () => {
    expect(hourlySql([])).toContain("WHERE 1=0");
  });

  it("topSql produces the right blob index", () => {
    expect(topSql("country", [1])).toMatchInlineSnapshot(`
      "SELECT blob2 AS name, count() AS clicks
      FROM tinyurl_clicks
      WHERE index1 IN ('1') AND timestamp > now() - INTERVAL '7' DAY
      GROUP BY name
      ORDER BY clicks DESC
      LIMIT 10"
    `);
    expect(topSql("device", "all", 5, 30)).toContain("blob9");
    expect(topSql("device", "all", 5, 30)).toContain("LIMIT 5");
    expect(topSql("device", "all", 5, 30)).toContain("INTERVAL '30' DAY");
  });

  it("totalSql counts rows", () => {
    expect(totalSql([1, 2, 3])).toContain("SELECT count() AS clicks");
    expect(totalSql([1, 2, 3])).toContain("index1 IN ('1', '2', '3')");
  });

  it("rejects non-integer link ids", () => {
    expect(() => hourlySql([1.5])).toThrow(/non-negative integer/);
    expect(() => hourlySql([-1])).toThrow(/non-negative integer/);
  });
});

describe("aeQuery", () => {
  beforeEach(() => {
    clearAeCache();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("posts to the SQL endpoint with bearer auth", async () => {
    const fetchMock = vi.fn(
      async (_input: unknown, _init?: unknown) =>
        new Response(JSON.stringify({ meta: [], data: [{ clicks: 5 }], rows: 1 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const rows = await aeQuery(env, "SELECT 1");
    expect(rows).toEqual([{ clicks: 5 }]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acc_123/analytics_engine/sql",
    );
    expect(call[1].method).toBe("POST");
    const headers = call[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer token_abc");
    expect(call[1].body).toBe("SELECT 1");
  });

  it("caches identical queries within the TTL", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ meta: [], data: [], rows: 0 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await aeQuery(env, "SELECT 1");
    await aeQuery(env, "SELECT 1");
    expect(fetchMock).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(60_001);
    await aeQuery(env, "SELECT 1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 401 })),
    );
    await expect(aeQuery(env, "SELECT 1")).rejects.toThrow(/401/);
  });
});

describe("typed helpers normalize rows", () => {
  beforeEach(() => clearAeCache());
  afterEach(() => vi.restoreAllMocks());

  it("hourlyClicks coerces to {hour, clicks}", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              meta: [],
              data: [{ hour: "2026-04-30T10:00:00Z", clicks: 7 }],
              rows: 1,
            }),
            { status: 200 },
          ),
      ),
    );
    const result = await hourlyClicks(env, [1]);
    expect(result).toEqual([{ hour: "2026-04-30T10:00:00Z", clicks: 7 }]);
  });

  it("topByBlob falls back to (unknown) for empty names", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              meta: [],
              data: [
                { name: "JP", clicks: 10 },
                { name: "", clicks: 3 },
              ],
              rows: 2,
            }),
            { status: 200 },
          ),
      ),
    );
    const result = await topByBlob(env, "country", [1]);
    expect(result).toEqual([
      { name: "JP", clicks: 10 },
      { name: "(unknown)", clicks: 3 },
    ]);
  });

  it("totalClicks reads first row", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ meta: [], data: [{ clicks: 42 }], rows: 1 }), {
            status: 200,
          }),
      ),
    );
    expect(await totalClicks(env, [1])).toBe(42);
  });
});
