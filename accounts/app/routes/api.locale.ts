import { redirect } from "react-router";
import { i18n, localeCookie } from "~/lib/i18n/i18n.server";
import { isLocale } from "~/lib/i18n/resources";
import type { Route } from "./+types/api.locale";

function safeReturnTo(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const requested = form.get("locale");
  const next = isLocale(requested) ? requested : await i18n.getLocale(request);
  const returnTo = safeReturnTo(form.get("return_to"));
  return redirect(returnTo, {
    headers: { "Set-Cookie": await localeCookie.serialize(next) },
  });
}

export function loader() {
  return redirect("/dashboard");
}
