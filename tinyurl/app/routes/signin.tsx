import { SSO_PROVIDER_ID, authClient } from "@gdgjp/auth-lib/client";
import { useEffect } from "react";
import { useSearchParams } from "react-router";

export function meta() {
  return [{ title: "Sign in — GDG Japan Links" }];
}

export default function SignInPage() {
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get("return_to")) ?? "/links";

  useEffect(() => {
    void authClient.signIn.oauth2({ providerId: SSO_PROVIDER_ID, callbackURL: returnTo });
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
