import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { GdgMark } from "~/components/gdg-mark";
import { ThemeToggle } from "~/components/theme-toggle";
import { Button } from "~/components/ui/button";
import { authClient } from "~/lib/auth-client";
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
  const returnTo = safeReturnTo(params.get("return_to")) ?? "/dashboard";

  function signIn() {
    void authClient.signIn.social({ provider: "google", callbackURL: returnTo });
  }

  return (
    <div className="relative min-h-dvh bg-muted/40">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <main className="grid min-h-dvh place-items-center px-4 py-10">
        <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-xl border bg-card p-8 shadow-sm">
          <Link to="/" aria-label={t("nav.homeAria")}>
            <GdgMark size="md" />
          </Link>
          <div className="space-y-1 text-center">
            <h1 className="text-xl font-medium tracking-tight">{t("auth.signin.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("auth.signin.subtitle")}</p>
          </div>
          <Button onClick={signIn} className="w-full" size="lg">
            {t("auth.signin.continueWithGoogle")}
          </Button>
        </div>
      </main>
    </div>
  );
}
