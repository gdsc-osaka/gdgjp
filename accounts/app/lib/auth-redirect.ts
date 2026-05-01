import { redirect } from "react-router";

export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  // Allow relative paths
  if (value.startsWith("/") && !value.startsWith("//")) {
    if (value.includes("\\") || value.includes("\r") || value.includes("\n")) return null;
    return value;
  }
  // Allow absolute HTTPS URLs on trusted gdgs.jp origins (sibling apps)
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      (url.hostname === "gdgs.jp" || url.hostname.endsWith(".gdgs.jp"))
    ) {
      return value;
    }
  } catch {
    // ignore invalid URLs
  }
  return null;
}

export function buildSignInRedirect(request: Request): Response {
  const url = new URL(request.url);
  const returnTo = url.pathname + url.search;
  return redirect(`/signin?return_to=${encodeURIComponent(returnTo)}`);
}
