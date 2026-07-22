import { expect, test, type Page } from "@playwright/test";
async function open(page: Page) {
  const target = page.viewportSize();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: /Workspace menu|工作区菜单/ }).click();
  await page.getByRole("menuitem", { name: /Settings|设置/ }).click();
  if (target) await page.setViewportSize(target);
  await page.getByText("AI", { exact: true }).click();
  await page.getByRole("button", { name: "Connect provider" }).click();
}
test("Connect Provider remains bounded and every category is reachable", async ({
  page,
}) => {
  await open(page);
  const dialog = page.getByRole("dialog"),
    tabs = dialog.getByRole("tablist", { name: "Provider categories" }),
    cards = dialog.locator(
      '[data-integration-provider-card],button[title^="Connect "],button[title^="Provider is listed"]',
    );
  await expect(
    dialog.getByText("Connect a provider", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
  const categories = [
    "All",
    "Recommended",
    "Global",
    "China",
    "Gateways",
    "Local",
    "Speech",
    "Image & video",
    "Custom",
  ];
  if (await tabs.isVisible()) {
    await expect(tabs.getByRole("tab")).toHaveCount(categories.length);
    for (const label of categories) {
      const tab = tabs.getByRole("tab", { name: label, exact: true });
      await tab.scrollIntoViewIfNeeded();
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
    }
  } else {
    const select = dialog.getByRole("combobox", {
      name: "Provider categories",
    });
    await expect(select.locator("option")).toHaveCount(categories.length);
    for (const value of [
      "all",
      "recommended",
      "global",
      "china",
      "gateway",
      "local",
      "speech",
      "media",
      "custom",
    ]) {
      await select.selectOption(value);
      await expect(select).toHaveValue(value);
    }
  }
  for (const dark of [false, true]) {
    await page.evaluate(
      (enabled) => document.documentElement.classList.toggle("dark", enabled),
      dark,
    );
    const geometry = await dialog.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      right: element.getBoundingClientRect().right,
      viewport: innerWidth,
    }));
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
    if (await tabs.isVisible()) {
      const tabGeometry = await tabs.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(tabGeometry.scrollWidth).toBeGreaterThanOrEqual(
        tabGeometry.clientWidth,
      );
    }
    for (const card of await cards.all()) {
      const box = await card.boundingBox();
      if (box) {
        const parent = await dialog.boundingBox();
        expect(box.x + box.width).toBeLessThanOrEqual(
          parent!.x + parent!.width,
        );
      }
    }
    await expect(dialog).toHaveScreenshot(
      `connect-provider-${dark ? "dark" : "light"}.png`,
    );
  }
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(
    dialog.getByText("Connect a provider", { exact: true }),
  ).toHaveCount(0);
});

test("Custom endpoint exposes explicit protocol families without overflow", async ({
  page,
}) => {
  await open(page);
  const dialog = page.getByRole("dialog");
  const tabs = dialog.getByRole("tablist", { name: "Provider categories" });
  if (await tabs.isVisible()) {
    await tabs.getByRole("tab", { name: "Custom", exact: true }).click();
  } else {
    await dialog.getByRole("combobox", { name: "Provider categories" }).selectOption("custom");
  }
  const custom = dialog.getByRole("button").filter({ hasText: "Custom endpoint" });
  await custom.scrollIntoViewIfNeeded();
  await custom.click();

  const protocol = dialog.getByRole("combobox", { name: "API protocol" });
  await expect(protocol).toContainText("OpenAI Chat Completions");
  await protocol.click();
  for (const label of [
    "OpenAI Responses",
    "OpenAI Chat Completions",
    "Anthropic Messages",
    "Google GenerateContent",
  ]) {
    await expect(page.getByRole("option", { name: label, exact: true })).toBeVisible();
  }
  await page.keyboard.press("Escape");

  const geometry = await dialog.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    right: element.getBoundingClientRect().right,
    viewport: innerWidth,
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
  await expect(dialog.getByRole("button", { name: "Check credentials and load models" })).toBeVisible();
});
