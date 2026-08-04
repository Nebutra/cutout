import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const releaseNotesCatalog = JSON.parse(
  readFileSync(new URL("../../src/release-notes/catalog.json", import.meta.url), "utf8"),
) as {
  entries: Array<{
    locales: Record<string, { highlights: unknown[] }>;
  }>;
};

const scenarios = [
  { name: "compact light Chinese", width: 390, height: 700, locale: "zh-CN", theme: "light" },
  { name: "desktop dark French", width: 1100, height: 800, locale: "fr", theme: "dark" },
] as const;

for (const scenario of scenarios) {
  test(`What's New remains bounded in ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.goto(`/tests/visual/fixtures/release-notes.html?locale=${scenario.locale}&theme=${scenario.theme}`);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { level: 2 })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /GitHub|版本页面/ })).toBeVisible();

    const geometry = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(scenario.width);
    expect(geometry.bottom).toBeLessThanOrEqual(scenario.height);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
    await expect(dialog.locator("ol > li")).toHaveCount(
      releaseNotesCatalog.entries[0]!.locales[scenario.locale].highlights.length,
    );
  });
}

test("What's New closes with Escape and restores trigger focus", async ({ page }) => {
  await page.goto("/tests/visual/fixtures/release-notes.html?locale=zh-CN&theme=light&interactive=1");
  const trigger = page.getByRole("button", { name: "Open What's New" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
