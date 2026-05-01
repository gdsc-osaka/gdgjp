import { createRequestHandler } from "react-router";
import { CloudflareContext } from "./context";

declare global {
  interface Env {
    CLERK_SECRET_KEY: string;
    CF_ACCOUNT_ID: string;
    CF_AE_API_TOKEN: string;
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env?.MODE ?? "production",
);

function isApexRedirect(request: Request, env: Env): { slug: string } | null {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.host;
  const apexHost = new URL(env.SHORT_URL_BASE).host;
  if (host === apexHost) {
    const slug = url.pathname.slice(1).split("/")[0];
    if (!slug) return null;
    return { slug };
  }
  if (url.pathname.startsWith("/r/")) {
    const slug = url.pathname.slice(3).split("/")[0];
    if (!slug) return null;
    return { slug };
  }
  return null;
}

const CLERK_PROXY_PREFIX = "/__clerk";
const CLERK_FAPI_ORIGIN = "https://clerk.gdgs.jp";

async function proxyClerkFapi(request: Request, proxyUrl: string): Promise<Response> {
  const incoming = new URL(request.url);
  const upstreamPath = incoming.pathname.slice(CLERK_PROXY_PREFIX.length) || "/";
  const upstream = new URL(`${CLERK_FAPI_ORIGIN}${upstreamPath}${incoming.search}`);

  const upstreamHeaders = new Headers(request.headers);
  upstreamHeaders.delete("host");
  for (const key of [...upstreamHeaders.keys()]) {
    if (key.toLowerCase().startsWith("cf-")) upstreamHeaders.delete(key);
  }

  const upstreamResponse = await fetch(upstream.toString(), {
    method: request.method,
    headers: upstreamHeaders,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete("set-cookie");
  const setCookies = upstreamResponse.headers.getSetCookie?.() ?? [];
  for (const cookie of setCookies) {
    responseHeaders.append("set-cookie", stripCookieDomain(cookie));
  }

  const location = responseHeaders.get("location");
  if (location) {
    responseHeaders.set("location", rewriteLocation(location, proxyUrl));
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

function stripCookieDomain(cookie: string): string {
  return cookie.replace(/;\s*Domain=[^;]*/i, "");
}

function rewriteLocation(location: string, proxyUrl: string): string {
  try {
    const target = new URL(location, CLERK_FAPI_ORIGIN);
    if (target.origin !== CLERK_FAPI_ORIGIN) return location;
    const base = new URL(proxyUrl);
    return `${base.origin}${base.pathname.replace(/\/$/, "")}${target.pathname}${target.search}${target.hash}`;
  } catch {
    return location;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === CLERK_PROXY_PREFIX || url.pathname.startsWith(`${CLERK_PROXY_PREFIX}/`)) {
      return proxyClerkFapi(request, env.CLERK_PROXY_URL);
    }
    const apex = isApexRedirect(request, env);
    if (apex) {
      const { handleApexRedirect } = await import("../app/lib/redirect-handler");
      const response = await handleApexRedirect(env, ctx, request, apex.slug);
      if (response) return response;
    }
    return requestHandler(request, new CloudflareContext({ env, ctx }));
  },
} satisfies ExportedHandler<Env>;
