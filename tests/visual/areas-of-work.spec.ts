import { expect, test } from "@playwright/test";

const FIXTURE = "/tests/visual/fixtures/areas-of-work.html";

const scenarios = [
  { name: "compact light English", width: 390, height: 700, locale: "en", theme: "light" },
  { name: "desktop dark Chinese", width: 1100, height: 800, locale: "zh-CN", theme: "dark" },
] as const;

for (const scenario of scenarios) {
  test(`Areas of work stays bounded in ${scenario.name}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.goto(`${FIXTURE}?locale=${scenario.locale}&theme=${scenario.theme}`);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { level: 2 })).toBeVisible();
    await expect(dialog.getByRole("group").getByRole("button")).toHaveCount(6);

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

    // The brand aside is desktop-only so the mobile bottom sheet keeps its
    // height budget.
    const aside = dialog.locator("aside");
    if (scenario.width < 640) {
      await expect(aside).toBeHidden();
    } else {
      await expect(aside).toBeVisible();
    }
  });
}

test("Areas of work caps the selection at three and reports it live", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto(`${FIXTURE}?locale=en&theme=light`);
  const dialog = page.getByRole("dialog");
  const tiles = dialog.getByRole("group").getByRole("button");
  const counter = dialog.locator('[aria-live="polite"]');

  await expect(counter).toHaveText("0 of 3 selected");
  for (const label of ["Web", "Mobile app", "Mini program"]) {
    await tiles.filter({ hasText: label }).click();
  }
  await expect(counter).toHaveText("3 of 3 selected");
  await expect(tiles.filter({ hasText: "Web" })).toHaveAttribute("aria-pressed", "true");

  // Over-cap tiles are disabled, never hidden.
  await expect(tiles).toHaveCount(6);
  const poster = tiles.filter({ hasText: "Poster" });
  await expect(poster).toBeDisabled();
  await expect(poster).toHaveAttribute("aria-pressed", "false");

  // Freeing a slot re-enables them.
  await tiles.filter({ hasText: "Web" }).click();
  await expect(counter).toHaveText("2 of 3 selected");
  await expect(poster).toBeEnabled();

  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("confirmed-areas")).toHaveText("mobile,miniapp");
});

test("Areas of work closes with Escape and restores trigger focus", async ({ page }) => {
  await page.goto(`${FIXTURE}?locale=en&theme=light&interactive=1`);
  const trigger = page.getByRole("button", { name: "Open areas of work" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
