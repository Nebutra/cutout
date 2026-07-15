import { expect, test, type Page } from "@playwright/test";

async function createStoppedRun(page: Page) {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Describe what you want to design..." })
    .fill("Canvas centered overlay regression");
  await page.getByRole("button", { name: "Create from brief" }).click();
  await expect(page.locator('[data-slot="canvas-centered-overlay"]')).toBeVisible();
}

async function centeredGeometry(page: Page) {
  return page.evaluate(() => {
    const overlay = document.querySelector<HTMLElement>('[data-slot="canvas-centered-overlay"]')!;
    const content = overlay.firstElementChild as HTMLElement;
    const bounds = overlay.getBoundingClientRect();
    let left = 0, right = 0, bottom = 0;
    document.querySelectorAll<HTMLElement>('[data-workspace-panel="agent-drawer"], [data-workspace-panel="files-drawer"], [aria-label="Inspector"]').forEach((panel) => {
      if (panel.offsetParent === null) return;
      const rect = panel.getBoundingClientRect();
      const overlapX = Math.max(0, Math.min(bounds.right, rect.right) - Math.max(bounds.left, rect.left));
      const overlapY = Math.max(0, Math.min(bounds.bottom, rect.bottom) - Math.max(bounds.top, rect.top));
      if (!overlapX || !overlapY) return;
      if (rect.width >= bounds.width * 0.8 && rect.top > bounds.top) bottom = Math.max(bottom, bounds.bottom - rect.top);
      else if (rect.left <= bounds.left + bounds.width / 2) left = Math.max(left, rect.right - bounds.left);
      else right = Math.max(right, bounds.right - rect.left);
    });
    const safe = {
      left: bounds.left + left,
      right: bounds.right - right,
      top: bounds.top,
      bottom: bounds.bottom - bottom,
    };
    const box = content.getBoundingClientRect();
    const overlap = [...document.querySelectorAll<HTMLElement>('.react-flow__minimap, [aria-label="Help"], [title="Help"], [data-slot="mascot"]')]
      .filter((element) => element.offsetParent !== null)
      .some((element) => {
        const other = element.getBoundingClientRect();
        return box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top;
      });
    return {
      errorX: Math.abs((box.left + box.right) / 2 - (safe.left + safe.right) / 2),
      errorY: Math.abs((box.top + box.bottom) / 2 - (safe.top + safe.bottom) / 2),
      overlap,
      contentWidth: box.width,
      safeWidth: safe.right - safe.left,
      documentFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    };
  });
}

test("Canvas centered states follow the responsive safe content rectangle", async ({ page }, testInfo) => {
  await createStoppedRun(page);
  const overlay = page.locator('[data-slot="canvas-centered-overlay"]');
  const assertCentered = async () => {
    await page.waitForTimeout(250);
    const geometry = await centeredGeometry(page);
    expect(geometry.errorX).toBeLessThanOrEqual(2);
    expect(geometry.errorY).toBeLessThanOrEqual(2);
    expect(geometry.overlap).toBe(false);
    expect(geometry.contentWidth).toBeLessThanOrEqual(geometry.safeWidth);
    expect(geometry.documentFits).toBe(true);
  };

  await assertCentered();
  const hideAgent = page.getByRole("button", { name: "Hide Agent" });
  if (await hideAgent.isVisible()) await hideAgent.click();
  await assertCentered();

  if (testInfo.project.name === "desktop-chrome") {
    await page.getByRole("button", { name: "Files", exact: true }).click();
    await assertCentered();
    await page.getByRole("button", { name: "Files", exact: true }).click();
    await page.getByRole("button", { name: "Inspector", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
    await assertCentered();
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await assertCentered();
    await page.getByRole("button", { name: "Expand sidebar" }).click();
  }

  await page.setViewportSize(testInfo.project.name === "mobile-chrome"
    ? { width: 390, height: 844 }
    : { width: 1180, height: 760 });
  await assertCentered();
  await overlay.evaluate((element) => {
    const title = element.querySelector("h2");
    const detail = element.querySelector("p");
    if (title) title.textContent = "超长的画布状态标题需要在安全区域内自然换行而不是遮挡控制栏";
    if (detail) detail.textContent = "This intentionally long bilingual explanation verifies wrapping across narrow responsive canvases，同时确保中文连续文本不会溢出或被吉祥物、缩略图和工具栏遮挡。";
  });
  await assertCentered();

  for (const dark of [false, true]) {
    await page.evaluate((enabled) => document.documentElement.classList.toggle("dark", enabled), dark);
    await expect(overlay).toHaveScreenshot(`canvas-centered-${dark ? "dark" : "light"}.png`);
  }
});
