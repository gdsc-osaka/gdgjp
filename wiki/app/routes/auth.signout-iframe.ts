import { getAuth } from "~/lib/auth.server";
import type { Route } from "./+types/auth.signout-iframe";

function collectSetCookies(headers: Headers): string[] {
  const fn = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof fn === "function") return fn.call(headers);
  const out: string[] = [];
  headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") out.push(value);
  });
  return out;
}

function frameAncestorsCsp(idpUrl: string | undefined, requestUrl: string): string {
  if (!idpUrl) {
    console.warn("auth.signout-iframe: IDP_URL is not set; emitting CSP without external origin", {
      url: requestUrl,
    });
    return "frame-ancestors 'self'";
  }
  try {
    return `frame-ancestors 'self' ${new URL(idpUrl).origin}`;
  } catch {
    console.warn(
      "auth.signout-iframe: IDP_URL is not a valid URL; emitting CSP without external origin",
      {
        url: requestUrl,
        idpUrl,
      },
    );
    return "frame-ancestors 'self'";
  }
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const auth = getAuth(env);
  let cookies: string[];
  const csp = frameAncestorsCsp(env.IDP_URL, request.url);
  try {
    const res = await auth.api.signOut({ headers: request.headers, asResponse: true });
    cookies = collectSetCookies(res.headers);
  } catch (err) {
    console.error("auth.signout-iframe: auth.api.signOut failed", {
      url: request.url,
      err,
    });
    return new Response("sign-out failed", {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": csp,
        "Referrer-Policy": "no-referrer",
      },
    });
  }

  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": csp,
    "Referrer-Policy": "no-referrer",
  });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response("<!doctype html><meta charset=utf-8><title>ok</title>", {
    status: 200,
    headers,
  });
}
