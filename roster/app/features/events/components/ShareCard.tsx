import { useState } from "react";
import { type EventStatus, STATUS_LABELS, canView } from "~/features/events/status";

/**
 * `/e/:id/share`'s single card (docs/roster/09-share-public-views.md
 * "Design" §1): one-click copy of `/r/:viewToken`, the current status, and
 * an explicit "what's public / what isn't" list so an owner can check it
 * before handing the URL out — mirrors `~/features/events/components
 * /ApplyLinkCard`'s copy-button pattern exactly. Deliberately has no status
 * select of its own (unlike `ApplyLinkCard`): `/e/:id/design` and
 * `/e/:id/staff` already own that control, and duplicating it a third place
 * would be a second source of truth for the same `updateEventSettings` call
 * for no benefit — this card only ever reads `status`, never writes it.
 *
 * The two-column list below is copied verbatim from docs/roster/09-share-
 * public-views.md "Design" §1's table — do not add or reword an entry here
 * without updating that table too, they must stay in sync (this is the
 * literal on-screen disclosure of ADR-005's decision).
 */
const PUBLIC_FIELDS = [
  "イベント名・日付・時間",
  "スタッフの表示名",
  "役割・トラック・時間",
  "懇親会の参加可否と人数",
];

const HIDDEN_FIELDS = [
  "メールアドレス・連絡先",
  "経験レベル（リード / 経験あり / 初参加）",
  "備考",
  "稼働可能時間の申告内容",
];

export function ShareCard({ viewUrl, status }: { viewUrl: string; status: EventStatus }) {
  const [copied, setCopied] = useState(false);
  const isPublished = canView(status);

  return (
    <section className="space-y-4 rounded-[2rem] border-2 border-black bg-white p-6 sm:p-8">
      <h2 className="font-bold">閲覧専用 URL</h2>
      <p className="text-sm text-neutral-600">
        現在のステータス: <span className="font-bold">{STATUS_LABELS[status]}</span>
      </p>

      {isPublished ? (
        <p className="rounded-xl border-2 border-black bg-neutral-100 p-3 text-sm font-medium">
          公開中です。このURLを共有すると、誰でもサインインなしでシフト表を閲覧できます。
        </p>
      ) : (
        <p className="rounded-xl border-2 border-black bg-neutral-100 p-3 text-sm font-medium">
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="font-bold">公開されるもの</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {PUBLIC_FIELDS.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span aria-hidden className="font-bold text-gdg-blue">
                  ○
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-bold">公開されないもの</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {HIDDEN_FIELDS.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span aria-hidden className="font-bold text-gdg-red">
                  ×
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
