import { expect, test } from "@playwright/test";

test("home page redirects unauthenticated users to sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/signin\?return_to=%2Fdashboard/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in");
  await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
});
