import { UserButton } from "@clerk/react-router";
import { requireUser } from "@gdgjp/auth-lib";
import { redirect } from "react-router";
import type { Route } from "./+types/dashboard";

export function meta() {
  return [{ title: "Dashboard — GDG Japan Accounts" }];
}

export async function loader(args: Route.LoaderArgs) {
  const env = args.context.cloudflare.env;
  try {
    const user = await requireUser(args.request, {
      publishableKey: env.CLERK_PUBLISHABLE_KEY,
      secretKey: env.CLERK_SECRET_KEY,
    });
    return { user };
  } catch {
    throw redirect("/sign-in");
  }
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  return (
    <main>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Dashboard</h1>
        <UserButton />
      </header>
      <p>Signed in as {loaderData.user.email}</p>
    </main>
  );
}
