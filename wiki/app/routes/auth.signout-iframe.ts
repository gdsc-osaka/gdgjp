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

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const auth = getAuth(env);
  let cookies: string[] = [];
  try {
    const res = await auth.api.signOut({ headers: request.headers, asResponse: true });
    cookies = collectSetCookies(res.headers);
  } catch {}

  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": `frame-ancestors 'self' ${env.IDP_URL}`,
    "Referrer-Policy": "no-referrer",
  });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response("<!doctype html><meta charset=utf-8><title>ok</title>", {
    status: 200,
    headers,
  });
}
