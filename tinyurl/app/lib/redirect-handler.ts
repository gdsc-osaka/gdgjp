import { writeClickEvent } from "./analytics-engine-write";
import { getLinkBySlug } from "./db";

export async function handleApexRedirect(
  env: Env,
  ctx: ExecutionContext,
  request: Request,
  slug: string,
): Promise<Response | null> {
  const link = await getLinkBySlug(env.DB, slug);
  if (!link) return null;
  ctx.waitUntil(Promise.resolve(writeClickEvent(env, request, link)));
  return new Response(null, {
    status: 302,
    headers: { Location: link.destinationUrl },
  });
}
