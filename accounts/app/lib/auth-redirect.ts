import { redirect } from "react-router";

export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\") || value.includes("\r") || value.includes("\n")) return null;
  return value;
}

export function buildSignInRedirect(request: Request): Response {
  const url = new URL(request.url);
  const returnTo = url.pathname + url.search;
  return redirect(`/signin?return_to=${encodeURIComponent(returnTo)}`);
}
