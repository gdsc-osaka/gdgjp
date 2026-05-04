import {
  type AuthUser,
  type UserChapter,
  getUserChapter,
  requireUser,
} from "@gdgjp/auth-lib/server";
import { redirect } from "react-router";

export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export function buildSignInRedirect(request: Request): Response {
  const url = new URL(request.url);
  const target = `${url.pathname}${url.search}`;
  return redirect(`/signin?return_to=${encodeURIComponent(target)}`);
}

export async function requireUserWithChapter(
  env: Env,
  request: Request,
): Promise<{ user: AuthUser; chapter: UserChapter }> {
  let user: AuthUser;
  try {
    user = await requireUser(env, request);
  } catch {
    throw buildSignInRedirect(request);
  }
  const chapter = await getUserChapter(env, request);
  if (!chapter) throw redirect("/no-chapter");
  return { user, chapter };
}
