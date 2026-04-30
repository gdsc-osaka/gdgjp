import { SignIn } from "@clerk/react-router";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { GdgMark } from "~/components/gdg-mark";
import { ThemeToggle } from "~/components/theme-toggle";
import { safeReturnTo } from "~/lib/auth-redirect";
import { i18n } from "~/lib/i18n/i18n.server";
import type { Route } from "./+types/signin";

export async function loader({ request }: Route.LoaderArgs) {
  const t = await i18n.getFixedT(request);
  return { title: t("meta.signin") };
}

export function meta({ data }: Route.MetaArgs) {
  return [{ title: data?.title }];
}

export default function SignInPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get("return_to"));
  const signUpUrl = returnTo ? `/signup?return_to=${encodeURIComponent(returnTo)}` : "/signup";
  return (
    <div className="relative min-h-dvh bg-muted/40">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <main className="grid min-h-dvh place-items-center px-4 py-10">
        <div className="flex w-full max-w-md flex-col items-center gap-6">
          <Link to="/" aria-label={t("nav.homeAria")}>
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
