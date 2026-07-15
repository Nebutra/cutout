import type { Page } from "@playwright/test";
import { expect, test } from "./local-state.fixture";

async function projectCount(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("cutout-projects", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<number>((resolve, reject) => {
        const request = db.transaction("projects", "readonly").objectStore("projects").count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}

test("Topbar New task resets Home and returns projects without creating drafts", async ({ page }) => {
  await page.goto("/");
  const composer = page.getByRole("textbox", { name: "Describe what you want to design..." });
  const newTask = page.getByRole("button", { name: "New task" });
  const initialCount = await projectCount(page);
  const buttonBox = await newTask.boundingBox();
  expect(buttonBox!.width).toBeGreaterThanOrEqual(44);
  expect(buttonBox!.height).toBeGreaterThanOrEqual(44);

  await page.getByRole("button", { name: "Web", exact: true }).click();
  await composer.fill("A prompt that should be explicitly cleared");
  await page.getByLabel("Add local files").setInputFiles({
    name: "reference.png",
    mimeType: "image/png",
    buffer: Buffer.from([137, 80, 78, 71]),
  });
  await expect(page.getByLabel("Composer attachments")).toContainText("reference.png");
  await newTask.focus();
  await expect(newTask).toBeFocused();
  await page.keyboard.press("Space");
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue("");
  await expect(page.getByLabel("Composer attachments")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Web", exact: true })).toHaveAttribute("aria-pressed", "false");
  expect(await projectCount(page)).toBe(initialCount);

  const projectName = `Persistent project ${Date.now()}`;
  await composer.fill(projectName);
  await page.getByRole("button", { name: "Create from brief" }).click();
  await expect(page.getByRole("textbox", { name: "Message the Agent" })).toHaveValue(projectName);
  await newTask.click();
  await expect(composer).toBeVisible();
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue("");
  await expect.poll(() => projectCount(page)).toBe(initialCount + 1);

  await newTask.click();
  await newTask.click();
  await expect(composer).toBeFocused();
  expect(await projectCount(page)).toBe(initialCount + 1);
  await page.getByRole("button", { name: /^All projects\b/ }).click();
  const directory = page.getByRole("heading", { name: "Your projects" }).locator("../../..");
  await expect(directory.getByRole("button", { name: `Open ${projectName}` })).toHaveCount(1);
  await expect(directory.getByRole("button", { name: "Open Untitled project" })).toHaveCount(0);

  await page.getByRole("button", { name: "New task" }).click();
  for (const dark of [false, true]) {
    await page.evaluate((enabled) => document.documentElement.classList.toggle("dark", enabled), dark);
    await expect(page.getByRole("main")).toHaveScreenshot(`new-task-home-${dark ? "dark" : "light"}.png`);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
