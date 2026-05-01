import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { authClient } from "~/lib/auth-client";

export function meta() {
  return [{ title: "Sign in — GDG Japan Wiki" }];
}

export default function SignInPage() {
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get("return_to")) ?? "/";

  useEffect(() => {
    void authClient.signIn.oauth2({ providerId: "gdgjp", callbackURL: returnTo });
  }, [returnTo]);

  return (
    <main>
      <p>Redirecting to sign in…</p>
    </main>
  );
}

function safeReturnTo(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}
