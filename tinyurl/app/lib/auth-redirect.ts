import { redirect } from "react-router";

export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export function buildSignInRedirect(request: Request, env: Env): Response {
  const url = new URL(request.url);
  const target = `${env.APP_URL}${url.pathname}${url.search}`;
  return redirect(`${env.ACCOUNTS_URL}/signin?return_to=${encodeURIComponent(target)}`);
}
