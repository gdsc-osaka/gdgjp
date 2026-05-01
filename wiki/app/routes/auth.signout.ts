import { redirect } from "react-router";
import type { Route } from "./+types/auth.signout";

export function loader({ context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const returnTo = `${env.APP_URL}/signin`;
  return redirect(`${env.IDP_URL}/auth/signout?return_to=${encodeURIComponent(returnTo)}`);
}
