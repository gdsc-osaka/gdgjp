import { handleAuthRequest } from "@gdgjp/auth-lib/server";
import type { Route } from "./+types/api.auth.$";

export async function loader(args: Route.LoaderArgs) {
  return handleAuthRequest(args.context.cloudflare.env, args.request);
}

export async function action(args: Route.ActionArgs) {
  return handleAuthRequest(args.context.cloudflare.env, args.request);
}
