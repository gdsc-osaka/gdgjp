import { requireUser } from "@gdgjp/auth-lib";
import { Form, redirect } from "react-router";
import { getMembership, listChapters, requestMembership } from "~/lib/db";
import type { Route } from "./+types/onboarding";

export function meta() {
  return [{ title: "Choose your chapter — GDG Japan Accounts" }];
}

export async function loader(args: Route.LoaderArgs) {
  const env = args.context.cloudflare.env;
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(args.request, {
      publishableKey: env.CLERK_PUBLISHABLE_KEY,
      secretKey: env.CLERK_SECRET_KEY,
    });
  } catch {
    throw redirect("/sign-in");
  }
  const membership = await getMembership(env.DB, user.id);
  if (membership) throw redirect("/dashboard");
  const chapters = await listChapters(env.DB);
  return { chapters };
}

export async function action(args: Route.ActionArgs) {
  const env = args.context.cloudflare.env;
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(args.request, {
      publishableKey: env.CLERK_PUBLISHABLE_KEY,
      secretKey: env.CLERK_SECRET_KEY,
    });
  } catch {
    throw redirect("/sign-in");
  }
  const form = await args.request.formData();
  const chapterId = Number(form.get("chapterId"));
  if (!Number.isInteger(chapterId) || chapterId <= 0) {
    return { error: "Please select a chapter." };
  }
  const result = await requestMembership(env.DB, user.id, chapterId);
  if (!result.ok) {
    return {
      error:
        result.reason === "chapter_not_found"
          ? "Chapter not found."
          : "You already have a chapter.",
    };
  }
  throw redirect("/dashboard");
}

export default function Onboarding({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <main style={{ maxWidth: 480, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>Choose your chapter</h1>
      <p>Pick the GDG or GDGoC chapter you belong to. An organizer will approve your request.</p>
      {loaderData.chapters.length === 0 ? (
        <p>No chapters are available yet. Please check back later.</p>
      ) : (
        <Form method="post">
          <ul style={{ listStyle: "none", padding: 0 }}>
            {loaderData.chapters.map((c) => (
              <li key={c.id} style={{ margin: "0.25rem 0" }}>
                <label>
                  <input type="radio" name="chapterId" value={c.id} required /> {c.name}{" "}
                  <span style={{ color: "#666" }}>({c.kind === "gdg" ? "GDG" : "GDGoC"})</span>
                </label>
              </li>
            ))}
          </ul>
          <button type="submit">Request membership</button>
        </Form>
      )}
      {actionData?.error ? <p style={{ color: "crimson" }}>{actionData.error}</p> : null}
    </main>
  );
}
