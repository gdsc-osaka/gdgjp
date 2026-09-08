import { useState } from "react";
import { type EventStatus, STATUS_LABELS, canView } from "~/features/events/status";

/**
 * `/e/:id/share`'s single card (docs/roster/09-share-public-views.md
 * "Design" §1): one-click copy of `/r/:viewToken` and the current status,
 * mirroring `~/features/events/components/ApplyLinkCard`'s copy-button pattern.
 * Deliberately has no status select of its own (unlike `ApplyLinkCard`): `/e/:id/design` and
 * `/e/:id/staff` already own that control, and duplicating it a third place
 * would be a second source of truth for the same `updateEventSettings` call
 * for no benefit — this card only ever reads `status`, never writes it.
 */
export function ShareCard({ viewUrl, status }: { viewUrl: string; status: EventStatus }) {
  const [copied, setCopied] = useState(false);
  const isPublished = canView(status);

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 className="font-semibold">閲覧専用URL</h2>
      <p className="text-sm text-neutral-600">
        現在のステータス: <span className="font-bold">{STATUS_LABELS[status]}</span>
      </p>

      {isPublished ? (
        <p className="rounded-lg border border-border bg-muted p-3 text-sm font-medium">
          公開中です。このURLを共有すると、誰でもサインインなしでシフト表を閲覧できます。
        </p>
      ) : (
        <p className="rounded-lg border border-border bg-muted p-3 text-sm font-medium">
          まだ公開されていません。ステータスを「{STATUS_LABELS.published}」にすると、このURLで
          誰でもシフト表を閲覧できるようになります。
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <code className="block flex-1 break-all rounded-xl bg-neutral-100 p-3 text-sm">
          {viewUrl}
        </code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(viewUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Clipboard access can be denied (permissions, non-HTTPS
              // context) — the URL is still selectable text either way, so
              // failing silently (no copied confirmation) is enough (see
              // ApplyLinkCard's identical fallback).
            }
          }}
          className="rounded-full border-2 border-black bg-white px-4 py-2 text-sm font-bold transition hover:bg-neutral-100"
        >
          {copied ? "コピーしました" : "コピー"}
        </button>
      </div>
    </section>
  );
}
