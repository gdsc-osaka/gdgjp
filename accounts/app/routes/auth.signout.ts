import { getAuth } from "~/lib/auth.server";
import type { Route } from "./+types/auth.signout";

function originsFromCsv(csv: string | undefined): string[] {
  if (!csv) return [];
  const out: string[] = [];
  for (const raw of csv.split(",")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      out.push(new URL(trimmed).origin);
    } catch {}
  }
  return out;
}

function rpOrigins(env: Env): string[] {
  const set = new Set<string>();
  for (const o of originsFromCsv(env.TINYURL_REDIRECT_URLS)) set.add(o);
  for (const o of originsFromCsv(env.WIKI_REDIRECT_URLS)) set.add(o);
  return [...set];
}

function safeReturnTo(returnTo: string, env: Env, rps: string[]): string {
  try {
    const url = new URL(returnTo, env.APP_URL);
    const selfOrigin = new URL(env.APP_URL).origin;
    if (url.origin === selfOrigin || rps.includes(url.origin)) return url.toString();
  } catch {}
  return new URL("/signin", env.APP_URL).toString();
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function renderSignOutPage(iframeUrls: string[], target: string): string {
  const iframes = iframeUrls
    .map(
      (u) =>
        `<iframe src="${escapeHtml(u)}" referrerpolicy="no-referrer" style="display:none" aria-hidden="true"></iframe>`,
    )
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Signing out…</title>
<meta name="robots" content="noindex" />
</head>
<body>
<p>Signing out…</p>
${iframes}
<script>
(function () {
  var done = false;
  var target = ${JSON.stringify(target)};
  var total = ${iframeUrls.length};
  var loaded = 0;
  function go() { if (done) return; done = true; window.location.replace(target); }
  if (total === 0) { go(); return; }
  document.querySelectorAll('iframe').forEach(function (f) {
    var settle = function () { loaded += 1; if (loaded >= total) go(); };
    f.addEventListener('load', settle, { once: true });
    f.addEventListener('error', settle, { once: true });
  });
  setTimeout(go, 3000);
})();
</script>
</body>
</html>`;
}

function collectSetCookies(headers: Headers): string[] {
  const fn = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof fn === "function") return fn.call(headers);
  const out: string[] = [];
  headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") out.push(value);
  });
  return out;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const url = new URL(request.url);
  const rps = rpOrigins(env);
  const target = safeReturnTo(url.searchParams.get("return_to") ?? "/signin", env, rps);

  const auth = getAuth(env);
  let cookies: string[] = [];
  try {
    const res = await auth.api.signOut({ headers: request.headers, asResponse: true });
    cookies = collectSetCookies(res.headers);
  } catch (err) {
    console.error("auth.signout: auth.api.signOut failed at IdP", {
      url: request.url,
      err,
    });
  }

  const iframeUrls = rps.map((origin) => `${origin}/auth/signout-iframe`);
  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(renderSignOutPage(iframeUrls, target), { status: 200, headers });
}
