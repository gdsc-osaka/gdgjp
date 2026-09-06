import { type Page, expect, test } from "@playwright/test";

/**
 * Sets the event status and confirms it actually persisted server-side
 * before returning. `<select>`'s `toHaveValue` reflects the *client-side*
 * selection the instant `selectOption()` runs — it does not wait for the
 * form's POST to complete — so asserting on it right after a click can pass
 * before the write has landed. Reloading and re-checking forces a fresh
 * server-rendered `defaultValue`, which only reflects committed state.
 */
async function setEventStatus(page: Page, status: string): Promise<void> {
  await page.selectOption('select[name="status"]', status);
  await page.getByRole("button", { name: "設定を保存" }).click();
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.locator('select[name="status"]')).toHaveValue(status);
}

/**
 * Full Stage 04 registration flow (docs/roster/04-applications.md
 * "手動 E2E" 1-13, condensed into one browser session by switching identity
 * through `/dev/login`): an owner creates and opens an event, an
 * unauthenticated visitor sees only the overview, a signed-in visitor from
 * a *different* Chapter can still register — the one non-negotiable
 * constraint of this stage (docs/roster/04-applications.md "Design" §4
 * 制約, "Chapter を要求しない") — and closing registration swaps the form
 * for "募集は終了しました" without 404ing (a live link must never look
 * broken).
 */
test("public registration: overview when signed out, form for any signed-in visitor, closed message once registration ends", async ({
  page,
}) => {
  // 1. Owner creates an event, selects a role, and opens registration.
  await page.goto("/dev/login?as=owner&chapter=1:e2e-owner-chapter&return_to=/events/new");
  await page.fill('input[name="name"]', "E2E Apply Flow Event");
  await page.fill('input[name="date"]', "2030-06-01");
  await page.getByRole("button", { name: "作成する" }).click();
  await page.waitForURL(/\/e\/[^/]+\/design$/);
  const eventId = new URL(page.url()).pathname.split("/")[2];

  await page.check('input[name="roleId"][value="reception"]');
  await page.getByRole("button", { name: "役割を保存" }).click();
  await expect(page.getByRole("checkbox", { name: "受付" })).toBeChecked();

  await setEventStatus(page, "open");

  await page.goto(`/e/${eventId}/staff`);
  const applyUrlText = (await page.locator("code").first().textContent())?.trim();
  if (!applyUrlText) throw new Error("apply URL not found on /e/:id/staff");
  const applyPath = new URL(applyUrlText).pathname;

  // 2. An unauthenticated visitor sees the event overview and the
  // recruiting role, but no registration form.
  await page.context().clearCookies();
  await page.goto(applyPath);
  await expect(page.getByText("受付")).toBeVisible();
  await expect(page.getByRole("link", { name: "サインインして登録する" })).toBeVisible();
  await expect(page.locator('input[name="name"]')).toHaveCount(0);

  // 3. A visitor from a DIFFERENT Chapter can still register.
  await page.goto(`/dev/login?as=staff1&chapter=999:other-chapter&return_to=${applyPath}`);
  await expect(page.locator('input[name="name"]')).toHaveValue(/staff1/);

  await page.check('input[name="role_reception"]');
  await page.getByRole("button", { name: "終日 ○" }).click();
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByRole("button", { name: "登録内容を更新" })).toBeVisible();

  // Reopening the same URL shows the same registration in edit mode — not a
  // second, duplicate signup.
  await page.reload();
  await expect(page.getByRole("button", { name: "登録内容を更新" })).toBeVisible();

  // 4. Closing registration swaps the form for the closed message.
  await page.goto(`/dev/login?as=owner&chapter=1:e2e-owner-chapter&return_to=/e/${eventId}/design`);
  await setEventStatus(page, "closed");

  await page.goto(applyPath);
  await expect(page.getByText("募集は終了しました")).toBeVisible();
});
