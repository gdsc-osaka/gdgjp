import { ClerkProvider } from "@clerk/react-router";
import { clerkMiddleware, rootAuthLoader } from "@clerk/react-router/server";
import { dark } from "@clerk/themes";
import type { ReactNode } from "react";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { ThemeProvider, themeInitScript, useTheme } from "~/lib/theme";
import type { Route } from "./+types/root";
import stylesheet from "./app.css?url";

const clerkSatelliteMiddleware: Route.MiddlewareFunction = (args, next) => {
  const env = args.context.cloudflare.env;
  return clerkMiddleware({
    publishableKey: env.CLERK_PUBLISHABLE_KEY,
    secretKey: env.CLERK_SECRET_KEY,
    isSatellite: true,
    proxyUrl: env.CLERK_PROXY_URL,
    signInUrl: env.CLERK_SIGN_IN_URL,
  })(args, next);
};

export const middleware: Route.MiddlewareFunction[] = [clerkSatelliteMiddleware];

export const loader = (args: Route.LoaderArgs) => rootAuthLoader(args);

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
  { rel: "stylesheet", href: stylesheet },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
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

function ClerkAppearance({
  loaderData,
  children,
}: {
  loaderData: Route.ComponentProps["loaderData"];
  children: ReactNode;
}) {
  const { resolvedTheme } = useTheme();
  return (
    <ClerkProvider
      loaderData={loaderData}
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
  return (
    <ThemeProvider>
      <ClerkAppearance loaderData={loaderData}>
        <Outlet />
      </ClerkAppearance>
    </ThemeProvider>
  );
}
