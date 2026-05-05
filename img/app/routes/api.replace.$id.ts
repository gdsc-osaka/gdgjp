import { requireUserWithChapter } from "~/lib/auth-redirect";
import { deleteFromCfImages, uploadToCfImages } from "~/lib/cf-images";
import { isValidImageId } from "~/lib/id";
import { getImage, updateImageBytes } from "~/lib/images";
import { canMutateImage } from "~/lib/permissions";
import { putOriginal } from "~/lib/r2";
import type { Route } from "./+types/api.replace.$id";

const MAX_BYTES = 10 * 1024 * 1024;

export async function action(args: Route.ActionArgs) {
  if (args.request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const id = args.params.id;
  if (!isValidImageId(id)) return new Response("Not found", { status: 404 });

  const env = args.context.cloudflare.env;
  const { user, chapter, accountId } = await requireUserWithChapter(env, args.request);
  const image = await getImage(env.DB, id);
  if (!image) return new Response("Not found", { status: 404 });
  if (!canMutateImage(user, image)) return new Response("Forbidden", { status: 403 });

  const form = await args.request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return new Response("missing file", { status: 400 });
  if (!file.type.startsWith("image/")) return new Response("not an image", { status: 415 });
  if (file.size > MAX_BYTES) return new Response("file too large", { status: 413 });

  const bytes = await file.arrayBuffer();
  const cf = await uploadToCfImages(env, new Blob([bytes], { type: file.type }), {
    appUserId: user.id,
    accountId,
    chapterId: String(chapter.chapterId),
    imageId: id,
  });

  const oldCfImageId = image.cfImageId;
  try {
    await putOriginal(env, image.r2Key, bytes, {
      contentType: file.type,
      userId: image.userId,
      chapterId: image.chapterId,
      filename: file.name || image.filename,
    });
    await updateImageBytes(env.DB, id, {
      cfImageId: cf.cfImageId,
      contentType: file.type,
      byteSize: file.size,
      width: cf.width,
      height: cf.height,
      filename: file.name || image.filename,
    });
  } catch (err) {
    args.context.cloudflare.ctx.waitUntil(deleteFromCfImages(env, cf.cfImageId));
    throw err;
  }

  args.context.cloudflare.ctx.waitUntil(deleteFromCfImages(env, oldCfImageId));
  return Response.json({ id });
}
