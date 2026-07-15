import { expect, test, type Page } from "@playwright/test";

async function openSettings(page: Page) {
  const targetViewport = page.viewportSize();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: /Workspace menu|工作区菜单/ }).click();
  await page.getByRole("menuitem", { name: /Settings|设置/ }).click();
  if (targetViewport) await page.setViewportSize(targetViewport);
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function assertNoViewportOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width);
}

test("Speech is separate from AI and exposes truthful progressive controls", async ({
  page,
}) => {
  await openSettings(page);
  await page.getByText("AI", { exact: true }).click();
  await expect(page.getByText("Speech to text", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Text to speech", { exact: true })).toHaveCount(0);

  await page.getByText("Speech", { exact: true }).click();
  await expect(page.getByText(/Auto routing is used by default/)).toBeVisible();
  await expect(page.getByText("Speech to text", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Text to speech", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Host required:/)).toBeVisible();
  await expect(
    page.getByText(/Speech preferences cannot be saved without/),
  ).toBeVisible();
  await expect(page.getByText(/Capability required:/)).toBeVisible();
  await expect(page.getByLabel("TTS voice")).toBeDisabled();
  await expect(page.getByLabel("Auto-play TTS responses")).toBeDisabled();

  await page.getByRole("button", { name: "Advanced" }).click();
  await expect(page.getByText("Speech to text", { exact: true })).toBeVisible();
  await expect(page.getByText("Text to speech", { exact: true })).toBeVisible();

  for (const dark of [false, true]) {
    await page.evaluate(
      (enabled) => document.documentElement.classList.toggle("dark", enabled),
      dark,
    );
    await assertNoViewportOverflow(page);
    await expect(page.getByRole("dialog")).toHaveScreenshot(
      `speech-settings-${dark ? "dark" : "light"}.png`,
    );
  }
});

test("Speech dictionary saves, survives reopen, and resets with confirmation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const key = "speech.preferences";
    (globalThis as any).__CUTOUT_SPEECH_STORE__ = {
      async get() {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : undefined;
      },
      async set(_key: string, value: unknown) {
        localStorage.setItem(key, JSON.stringify(value));
      },
      async delete() {
        localStorage.removeItem(key);
      },
    };
  });
  await openSettings(page);
  await page.getByText("Speech", { exact: true }).click();
  const entry = `Cutout-${Date.now()}`;
  await page.getByLabel("Dictionary entry").fill(entry);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("button", { name: `Remove ${entry}` })).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await openSettings(page);
  await page.getByText("Speech", { exact: true }).click();
  await expect(page.getByRole("button", { name: `Remove ${entry}` })).toBeVisible();
  await page.reload();
  await openSettings(page);
  await page.getByText("Speech", { exact: true }).click();
  await expect(page.getByRole("button", { name: `Remove ${entry}` })).toBeVisible();

  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByText("Reset speech preferences?", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reset speech" }).click();
  await expect(page.getByRole("button", { name: `Remove ${entry}` })).toHaveCount(0);
});
