import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { authClient } from "~/lib/auth-client";

export function meta() {
  return [{ title: "Sign in — GDG Japan Links" }];
}

export default function SignInPage() {
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get("return_to")) ?? "/links";

  useEffect(() => {
    void authClient.signIn.oauth2({ providerId: "gdgjp", callbackURL: returnTo });
  }, [returnTo]);

  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <p className="text-sm text-muted-foreground">Redirecting to sign in…</p>
    </div>
  );
}

function safeReturnTo(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}
