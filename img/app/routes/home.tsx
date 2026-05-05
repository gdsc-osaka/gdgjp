import { GalleryGrid, type GalleryItem } from "~/components/gallery-grid";
import { PageShell } from "~/components/page-shell";
import { UploadForm } from "~/components/upload-form";
import { requireUserWithChapter } from "~/lib/auth-redirect";
import { deliveryUrl } from "~/lib/cf-images";
import { listImagesByUser } from "~/lib/images";
import type { Route } from "./+types/home";

export function meta() {
  return [{ title: "GDG Japan Image" }];
}

export async function loader(args: Route.LoaderArgs) {
  const env = args.context.cloudflare.env;
  const { user } = await requireUserWithChapter(env, args.request);
  const rows = await listImagesByUser(env.DB, user.id);
  const items: GalleryItem[] = rows.map((r) => ({
    id: r.id,
    thumbUrl: deliveryUrl(env, r.cfImageId),
    filename: r.filename,
  }));
  return { user: { email: user.email, name: user.name }, items };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { user, items } = loaderData;
  return (
    <PageShell user={user} size="lg">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your images</h1>
          <p className="text-sm text-muted-foreground">
            Upload images and share <code>img.gdgs.jp/&lt;id&gt;</code> links. Anyone with the link
            can view; only chapter members can upload.
          </p>
        </div>
        <UploadForm />
        <GalleryGrid items={items} />
      </div>
    </PageShell>
  );
}
