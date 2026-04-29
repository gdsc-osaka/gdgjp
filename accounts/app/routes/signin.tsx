import { SignIn } from "@clerk/react-router";
import { Link, useSearchParams } from "react-router";
import { GdgMark } from "~/components/gdg-mark";
import { ThemeToggle } from "~/components/theme-toggle";
import { safeReturnTo } from "~/lib/auth-redirect";

export function meta() {
  return [{ title: "Sign in — GDG Japan Accounts" }];
}

export default function SignInPage() {
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get("return_to"));
  const signUpUrl = returnTo
    ? `/signup?return_to=${encodeURIComponent(returnTo)}`
    : "/signup";
  return (
    <div className="relative min-h-dvh bg-muted/40">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <main className="grid min-h-dvh place-items-center px-4 py-10">
        <div className="flex w-full max-w-md flex-col items-center gap-6">
          <Link to="/" aria-label="GDG Japan Accounts home">
            <GdgMark size="md" />
          </Link>
          <SignIn
            routing="path"
            path="/signin"
            signUpUrl={signUpUrl}
            forceRedirectUrl={returnTo ?? undefined}
          />
        </div>
      </main>
    </div>
  );
}
