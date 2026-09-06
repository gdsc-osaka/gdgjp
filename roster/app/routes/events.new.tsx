import { redirect } from "react-router";
import { requireUserWithChapter } from "~/features/auth/auth-redirect.server";
import { EventForm } from "~/features/events/components/EventForm";
import { createEvent } from "~/features/events/events.server";
import { regenerateTimeSlots } from "~/features/schedule/schedule.server";
import { createTrack } from "~/features/schedule/tracks.server";
import type { Route } from "./+types/events.new";

export function meta() {
  return [{ title: "イベント作成 — roster" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const { chapters } = await requireUserWithChapter(env, request);
  return { chapters };
}

/**
 * Creates the event, its initial time-slot grid (no phases yet), and a
 * single shared "全体" track (docs/roster/index.md §3 "トラック") — all
 * three must exist before `/e/:id/design` first renders
 * (docs/roster/02-domain-schema.md "Verification" #2).
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const { user, chapters } = await requireUserWithChapter(env, request);
  const form = await request.formData();

  const name = String(form.get("name") ?? "").trim();
  const date = String(form.get("date") ?? "");
  const startTime = String(form.get("startTime") ?? "");
  const endTime = String(form.get("endTime") ?? "");
  const stepMin = Number.parseInt(String(form.get("stepMin") ?? ""), 10);
  const chapterId = Number.parseInt(String(form.get("chapterId") ?? ""), 10);
  const chapter = chapters.find((c) => c.chapterId === chapterId);

  if (!name) return { error: "イベント名を入力してください。" };
  if (!date) return { error: "開催日を選択してください。" };
  if (!startTime || !endTime || startTime >= endTime) {
    return { error: "開始時刻は終了時刻より前にしてください。" };
  }
  if (![15, 30, 60].includes(stepMin)) return { error: "刻み幅が不正です。" };
  if (!chapter) return { error: "チャプターを選択してください。" };

  const event = await createEvent(env.DB, {
    chapterId: chapter.chapterId,
    name,
    date,
    startTime,
    endTime,
    stepMin,
    createdBy: user.id,
  });
  await regenerateTimeSlots(env.DB, event.id, { start: startTime, end: endTime, stepMin }, []);
  await createTrack(env.DB, event.id, { name: "全体", color: "#4285f4", shared: true });

  return redirect(`/e/${event.id}/design`);
}

export default function NewEvent({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 p-6 lg:p-10">
      <h1 className="text-2xl font-bold">イベントを作成</h1>
      <EventForm chapters={loaderData.chapters} error={actionData?.error} />
    </main>
  );
}
