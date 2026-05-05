import { requireUserWithChapter } from "~/lib/auth-redirect";
import { deleteFromCfImages, uploadToCfImages } from "~/lib/cf-images";
import { generateUniqueImageId } from "~/lib/id";
import { createImage } from "~/lib/images";
import { putOriginal } from "~/lib/r2";
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

  const cf = await uploadToCfImages(env, new Blob([bytes], { type: file.type }), {
    appUserId: user.id,
    accountId,
    chapterId: String(chapter.chapterId),
    imageId: id,
  });

  try {
    await putOriginal(env, id, bytes, {
      contentType: file.type,
      userId: user.id,
      chapterId: chapter.chapterId,
      filename: file.name || null,
    });
    await createImage(env.DB, {
      id,
      userId: user.id,
      accountId,
      chapterId: chapter.chapterId,
      cfImageId: cf.cfImageId,
      r2Key: id,
      contentType: file.type,
      byteSize: file.size,
      width: cf.width,
      height: cf.height,
      filename: file.name || null,
    });
  } catch (err) {
    args.context.cloudflare.ctx.waitUntil(deleteFromCfImages(env, cf.cfImageId));
    throw err;
  }

  return Response.json({ id });
}
