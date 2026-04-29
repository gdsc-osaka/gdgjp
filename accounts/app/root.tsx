import { enUS, jaJP } from "@clerk/localizations";
import { ClerkProvider } from "@clerk/react-router";
import { clerkMiddleware, rootAuthLoader } from "@clerk/react-router/server";
import { dark } from "@clerk/themes";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { i18n } from "~/lib/i18n/i18n.server";
import { fallbackLng, isLocale } from "~/lib/i18n/resources";
import { ThemeProvider, themeInitScript, useTheme } from "~/lib/theme";
import type { Route } from "./+types/root";
import stylesheet from "./app.css?url";

export const middleware: Route.MiddlewareFunction[] = [clerkMiddleware()];

export const loader = (args: Route.LoaderArgs) =>
  rootAuthLoader(args, async ({ request }) => {
    const locale = await i18n.getLocale(request);
    return { locale };
  });

export const handle = { i18n: ["common"] };

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
  { rel: "stylesheet", href: stylesheet },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const lang = useRootLang();
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: pre-paint theme bootstrap */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function useRootLang() {
  const { i18n: i18nClient } = useTranslation();
  return i18nClient.resolvedLanguage ?? i18nClient.language ?? fallbackLng;
}

function ClerkAppearance({
  loaderData,
  children,
}: {
  loaderData: Route.ComponentProps["loaderData"];
  children: React.ReactNode;
}) {
  const { resolvedTheme } = useTheme();
  const { i18n: i18nClient } = useTranslation();
  const localization = i18nClient.resolvedLanguage === "ja" ? jaJP : enUS;
  return (
    <ClerkProvider
      loaderData={loaderData}
      localization={localization}
      appearance={{
        baseTheme: resolvedTheme === "dark" ? dark : undefined,
        variables: {
          colorPrimary: "#4285F4",
          fontFamily: '"Google Sans", sans-serif',
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  const { i18n: i18nClient } = useTranslation();
  const locale = isLocale(loaderData.locale) ? loaderData.locale : fallbackLng;
  useEffect(() => {
    if (i18nClient.resolvedLanguage !== locale) {
      void i18nClient.changeLanguage(locale);
    }
  }, [locale, i18nClient]);
  return (
    <ThemeProvider>
      <ClerkAppearance loaderData={loaderData}>
        <Outlet />
      </ClerkAppearance>
    </ThemeProvider>
  );
}
