import { SignUp } from "@clerk/react-router";
import { Link, useSearchParams } from "react-router";
import { GdgMark } from "~/components/gdg-mark";
import { ThemeToggle } from "~/components/theme-toggle";
import { safeReturnTo } from "~/lib/auth-redirect";

export function meta() {
  return [{ title: "Sign up — GDG Japan Accounts" }];
}

export default function SignUpPage() {
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get("return_to"));
  const signInUrl = returnTo
    ? `/signin?return_to=${encodeURIComponent(returnTo)}`
    : "/signin";
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
          <SignUp
            routing="path"
            path="/signup"
            signInUrl={signInUrl}
            forceRedirectUrl={returnTo ?? undefined}
          />
        </div>
      </main>
    </div>
  );
}
