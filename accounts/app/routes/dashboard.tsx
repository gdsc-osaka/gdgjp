import { UserButton } from "@clerk/react-router";
import { requireUser } from "@gdgjp/auth-lib";
import { Link, redirect } from "react-router";
import { getMembership } from "~/lib/db";
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
    const membership = await getMembership(env.DB, user.id);
    return { user, membership };
  } catch {
    throw redirect("/sign-in");
  }
}

function MembershipPanel({
  membership,
}: { membership: Route.ComponentProps["loaderData"]["membership"] }) {
  if (!membership) {
    return (
      <section>
        <p>You haven't joined a chapter yet.</p>
        <Link to="/onboarding">Choose your chapter</Link>
      </section>
    );
  }
  const roleLabel = membership.role === "organizer" ? "Organizer" : "Member";
  if (membership.status === "pending") {
    return (
      <section>
        <p>
          Awaiting approval to join <strong>{membership.chapter.name}</strong>.
        </p>
      </section>
    );
  }
  return (
    <section>
      <p>
        {roleLabel} of <strong>{membership.chapter.name}</strong>.
      </p>
      {membership.role === "organizer" ? (
        <Link to={`/chapters/${membership.chapter.slug}/organize`}>Organize chapter</Link>
      ) : null}
    </section>
  );
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { user, membership } = loaderData;
  return (
    <main>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Dashboard</h1>
        <UserButton />
      </header>
      <p>Signed in as {user.email}</p>
      <MembershipPanel membership={membership} />
      {user.isAdmin ? (
        <nav style={{ marginTop: "1rem" }}>
          <Link to="/admin/chapters">Manage chapters (admin)</Link>
        </nav>
      ) : null}
    </main>
  );
}
