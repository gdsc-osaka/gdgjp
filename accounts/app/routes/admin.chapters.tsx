import { requireUser } from "@gdgjp/auth-lib";
import { Form, Link, redirect } from "react-router";
import { type ChapterKind, createChapter, deleteChapter, listChapters } from "~/lib/db";
import { requireSuperAdmin } from "~/lib/permissions";
import type { Route } from "./+types/admin.chapters";

export function meta() {
  return [{ title: "Manage chapters — GDG Japan Accounts" }];
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
  requireSuperAdmin(user);
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
  requireSuperAdmin(user);
  const form = await args.request.formData();
  const intent = form.get("intent");
  if (intent === "delete") {
    const id = Number(form.get("id"));
    if (Number.isInteger(id) && id > 0) {
      await deleteChapter(env.DB, id);
    }
    return null;
  }
  if (intent === "create") {
    const slug = String(form.get("slug") ?? "").trim();
    const name = String(form.get("name") ?? "").trim();
    const kind = String(form.get("kind") ?? "") as ChapterKind;
    if (!slug || !name || (kind !== "gdg" && kind !== "gdgoc")) {
      return { error: "All fields are required." };
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return { error: "Slug must be lowercase letters, numbers, and dashes." };
    }
    try {
      await createChapter(env.DB, { slug, name, kind });
    } catch {
      return { error: "Could not create chapter (slug may already exist)." };
    }
    return null;
  }
  return { error: "Unknown action." };
}

export default function AdminChapters({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
      <p>
        <Link to="/dashboard">← Back to dashboard</Link>
      </p>
      <h1>Manage chapters</h1>

      <section>
        <h2>Create a chapter</h2>
        <Form method="post">
          <input type="hidden" name="intent" value="create" />
          <p>
            <label>
              Slug <input name="slug" placeholder="gdg-tokyo" pattern="[a-z0-9-]+" required />
            </label>
          </p>
          <p>
            <label>
              Name <input name="name" placeholder="GDG Tokyo" required />
            </label>
          </p>
          <p>
            <label>
              Kind{" "}
              <select name="kind" defaultValue="gdg">
                <option value="gdg">GDG</option>
                <option value="gdgoc">GDGoC</option>
              </select>
            </label>
          </p>
          <button type="submit">Create</button>
        </Form>
        {actionData?.error ? <p style={{ color: "crimson" }}>{actionData.error}</p> : null}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Existing chapters</h2>
        {loaderData.chapters.length === 0 ? (
          <p>No chapters yet.</p>
        ) : (
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th align="left">Name</th>
                <th align="left">Slug</th>
                <th align="left">Kind</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loaderData.chapters.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.slug}</td>
                  <td>{c.kind === "gdg" ? "GDG" : "GDGoC"}</td>
                  <td align="right">
                    <Link to={`/chapters/${c.slug}/organize`}>Organize</Link>{" "}
                    <Form
                      method="post"
                      style={{ display: "inline" }}
                      onSubmit={(e) => {
                        if (!confirm(`Delete ${c.name}? Members will lose their membership.`)) {
                          e.preventDefault();
                        }
                      }}
                    >
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit">Delete</button>
                    </Form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
