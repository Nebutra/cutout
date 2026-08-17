import { expect, test, type Page } from "@playwright/test";

async function openUpdatesAndSupport(page: Page) {
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: /Workspace menu|工作区菜单/ }).click();
  await page.getByRole("menuitem", { name: /Settings|设置/ }).click();
  await page.getByText("Updates & Support", { exact: true }).click();
  if (viewport) await page.setViewportSize(viewport);
  await expect(page.getByRole("region", { name: "Updates" })).toBeVisible();
}

test("Updates stays truthful and configurable without a desktop runtime", async ({ page }) => {
  await openUpdatesAndSupport(page);
  const updates = page.getByRole("region", { name: "Updates" });
  await expect(updates).toBeVisible();
  // The browser fallback cannot truthfully know the packaged desktop version.
  // Tauri resolves the real version through getVersion at runtime.
  await expect(updates).toContainText("Current version unknown");
  await expect(updates.getByRole("status")).toContainText("available only in the Cutout desktop app");
  await expect(updates.getByRole("button", { name: "Check now" })).toBeDisabled();
  await expect(updates.getByText("What's New", { exact: true })).toBeVisible();
  await expect(updates.getByText("Review the highlights for Cutout 0.1.23.")).toBeVisible();
  const openReleaseNotes = updates.getByRole("button", { name: "Open" });
  await expect(openReleaseNotes).toBeEnabled();
  await openReleaseNotes.click();
  const releaseNotes = page.getByRole("dialog").filter({ hasText: "Cutout v0.1.23" });
  await expect(releaseNotes).toContainText("A Canvas-first Design OS for Commerce and Game production");
  await expect(releaseNotes).toContainText("Work through Agent and Canvas");
  await page.keyboard.press("Escape");

  // Browser builds have no compiled updater endpoints, so they must not offer
  // a channel choice that only a packaged desktop runtime can support.
  await expect(updates.getByRole("group", { name: "Update channel" })).toHaveCount(0);
  await expect(updates.getByRole("button", { name: "Beta" })).toHaveCount(0);
  const automatic = updates.getByRole("switch", { name: "Check for updates automatically" });
  await automatic.click();
  await expect(automatic).toHaveAttribute("aria-checked", "false");

  await expect(updates.getByText(/Install & restart/i)).toHaveCount(0);
  await expect(updates.getByText(/Download update/i)).toHaveCount(0);
});
