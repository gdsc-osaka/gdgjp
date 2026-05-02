import { type AuthUser, type UserChapter, getUserChapter, requireUser } from "@gdgjp/auth-lib";
import { redirect } from "react-router";
import { getAuth } from "~/lib/auth.server";

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
  const auth = getAuth(env);
  let user: AuthUser;
  try {
    user = await requireUser(auth, request);
  } catch {
    throw buildSignInRedirect(request);
  }
  const chapter = await getUserChapter(auth, request);
  if (!chapter) throw redirect("/no-chapter");
  return { user, chapter };
}
