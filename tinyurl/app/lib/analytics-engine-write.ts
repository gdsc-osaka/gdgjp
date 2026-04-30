import type { Link } from "./db";
import { parseUA } from "./ua-parse";

export function writeClickEvent(env: Env, request: Request, link: Link): void {
  if (!env.CLICKS_AE) return;
  const cf = (request as Request & { cf?: Record<string, string> }).cf ?? {};
  const ua = request.headers.get("user-agent");
  const { browser, os, device } = parseUA(ua);
  const referer = request.headers.get("referer") ?? "";
  const country = cf.country ?? "";
  const region = cf.region ?? "";
  const city = cf.city ?? "";
  const continent = cf.continent ?? "";

  env.CLICKS_AE.writeDataPoint({
    blobs: [link.slug, country, region, city, continent, referer, browser, os, device],
    indexes: [String(link.id)],
  });
}
