import { expect, test } from "@playwright/test";

test("home page redirects unauthenticated users to sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(
    "http://localhost:5173/signin?return_to=http%3A%2F%2Flocalhost%3A5174%2Flinks",
  );
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Sign in to GDG Japan");
});
