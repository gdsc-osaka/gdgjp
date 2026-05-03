import { getChapterByUserId } from "~/lib/db";
import type { Route } from "./+types/api.internal.chapter";

export function loader() {
  return new Response("Method Not Allowed", { status: 405 });
}

export async function action(args: Route.ActionArgs) {
  const env = args.context.cloudflare.env;
  const expected = env.INTERNAL_API_SECRET;
  if (!expected) return new Response("Internal API not configured", { status: 500 });

  const provided = bearerToken(args.request.headers.get("Authorization"));
  if (!provided || !timingSafeEqual(provided, expected)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await args.request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const userId =
    body && typeof body === "object" && typeof (body as { userId?: unknown }).userId === "string"
      ? (body as { userId: string }).userId
      : null;
  if (!userId) return new Response("Missing userId", { status: 400 });

  const chapter = await getChapterByUserId(env.DB, userId);
  return Response.json({ chapter });
}

function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(" ", 2);
  if (scheme?.toLowerCase() !== "bearer" || !value) return null;
  return value;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
