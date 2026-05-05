import { requireUserWithChapter } from "~/lib/auth-redirect";
import { generateUniqueImageId } from "~/lib/id";
import { createImage } from "~/lib/images";
import { deleteOriginal, putOriginal } from "~/lib/r2";
import type { Route } from "./+types/api.upload";

const MAX_BYTES = 10 * 1024 * 1024;

export async function action(args: Route.ActionArgs) {
  if (args.request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const env = args.context.cloudflare.env;
  const { user, chapter, accountId } = await requireUserWithChapter(env, args.request);

  const form = await args.request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return new Response("missing file", { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return new Response("not an image", { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return new Response("file too large", { status: 413 });
  }

  const id = await generateUniqueImageId(env.DB);
  const bytes = await file.arrayBuffer();

  await putOriginal(env, id, bytes, {
    contentType: file.type,
    userId: user.id,
    chapterId: chapter.chapterId,
    filename: file.name || null,
  });

  try {
    await createImage(env.DB, {
      id,
      userId: user.id,
      accountId,
      chapterId: chapter.chapterId,
      r2Key: id,
      contentType: file.type,
      byteSize: file.size,
      width: null,
      height: null,
      filename: file.name || null,
    });
  } catch (err) {
    args.context.cloudflare.ctx.waitUntil(deleteOriginal(env, id));
    throw err;
  }

  return Response.json({ id });
}
