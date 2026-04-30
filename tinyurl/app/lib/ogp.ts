export type OgpData = {
  title: string | null;
  description: string | null;
  image: string | null;
};

const MAX_BYTES = 256 * 1024;
const TIMEOUT_MS = 3000;

const PRIVATE_HOSTS =
  /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|::1$|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:)/i;
const PRIVATE_RANGE_172 = /^172\.(1[6-9]|2[0-9]|3[01])\./;

function isPrivateHostname(hostname: string): boolean {
  if (PRIVATE_HOSTS.test(hostname)) return true;
  if (PRIVATE_RANGE_172.test(hostname)) return true;
  return false;
}

function pickMeta(html: string, property: string): string | null {
  const propMatch = new RegExp(
    `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i",
  ).exec(html);
  if (propMatch) return propMatch[1];
  const nameMatch = new RegExp(
    `<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i",
  ).exec(html);
  if (nameMatch) return nameMatch[1];
  const reverseMatch = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    "i",
  ).exec(html);
  return reverseMatch?.[1] ?? null;
}

export async function fetchOgp(url: string): Promise<OgpData | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (isPrivateHostname(parsed.hostname)) return null;

  let response: Response;
  try {
    response = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "GDGJapanLinks/1.0 (OGP fetcher)" },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const ct = response.headers.get("content-type") ?? "";
  if (!ct.includes("text/html") && !ct.includes("application/xhtml")) return null;

  const reader = response.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let html = "";
  let received = 0;
  try {
    while (received < MAX_BYTES) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (received >= MAX_BYTES) break;
      if (/<\/head>/i.test(html)) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  const title = pickMeta(html, "og:title") ?? extractTitle(html);
  const description = pickMeta(html, "og:description") ?? pickMeta(html, "description");
  const image = pickMeta(html, "og:image");
  if (!title && !description && !image) return null;
  return { title, description, image };
}

function extractTitle(html: string): string | null {
  const m = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return m ? m[1].trim() : null;
}
