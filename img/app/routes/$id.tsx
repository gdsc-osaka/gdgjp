import { redirect } from "react-router";
import { deliveryUrl } from "~/lib/cf-images";
import { isValidImageId } from "~/lib/id";
import { getImage } from "~/lib/images";
import type { Route } from "./+types/$id";

export async function loader(args: Route.LoaderArgs) {
  const id = args.params.id;
  if (!isValidImageId(id)) throw new Response("Not found", { status: 404 });
  const env = args.context.cloudflare.env;
  const image = await getImage(env.DB, id);
  if (!image) throw new Response("Not found", { status: 404 });
  return redirect(deliveryUrl(env, image.cfImageId), {
    status: 302,
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}

export default function ImageRedirect() {
  return null;
}
