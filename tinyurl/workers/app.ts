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

export default {
  async fetch(request, env, ctx) {
    const apex = isApexRedirect(request, env);
    if (apex) {
      const { handleApexRedirect } = await import("../app/lib/redirect-handler");
      const response = await handleApexRedirect(env, ctx, request, apex.slug);
      if (response) return response;
    }
    return requestHandler(request, new CloudflareContext({ env, ctx }));
  },
} satisfies ExportedHandler<Env>;
