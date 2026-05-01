import { expect, test } from "@playwright/test";

test("home page redirects unauthenticated users to sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/signin\?return_to=.*%2Flinks/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sign in to GDG Japan");
});
