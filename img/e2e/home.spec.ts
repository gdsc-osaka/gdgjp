import { expect, test } from "@playwright/test";

test("home page redirects unauthenticated users to the local sign-in route", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/signin\?return_to=%2F/);
});
