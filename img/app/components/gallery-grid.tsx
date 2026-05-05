import { Link } from "react-router";

export type GalleryItem = {
  id: string;
  thumbUrl: string;
  filename: string | null;
};

export function GalleryGrid({ items }: { items: GalleryItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        No images yet. Upload one above to get started.
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {items.map((it) => (
        <li key={it.id}>
          <Link
            to={`/i/${it.id}`}
            className="group block overflow-hidden rounded-md border bg-muted/40 transition hover:border-ring"
          >
            <div className="aspect-square overflow-hidden">
              <img
                src={it.thumbUrl}
                alt={it.filename ?? it.id}
                loading="lazy"
                className="size-full object-cover transition group-hover:scale-105"
              />
            </div>
            <div className="truncate px-2 py-1 text-xs text-muted-foreground">{it.id}</div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
