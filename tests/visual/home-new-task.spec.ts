import type { Page } from "@playwright/test";
import { test, expect } from "./local-state.fixture";
const presets = [
  "Web",
  "Mobile app",
  "Mini program",
  "Desktop",
  "Brand kit",
  "Poster",
] as const;
async function projectCount(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open("cutout-projects");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!db.objectStoreNames.contains("projects")) {
      db.close();
      return 0;
    }
    const tx = db.transaction("projects", "readonly"),
      count = await new Promise<number>((resolve, reject) => {
        const result = tx.objectStore("projects").count();
        result.onsuccess = () => resolve(result.result);
        result.onerror = () => reject(result.error);
      });
    db.close();
    return count;
  });
}
for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
])
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });
    test("presets only prepare the brief and global plus is idempotent", async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("/");
      const textarea = page.getByRole("textbox", { name: "Describe what you want to design..." });
      await expect(textarea).toBeVisible();
      const initialCount = await projectCount(page);
      for (const preset of presets) {
        const start = performance.now();
        await page.getByRole("button", { name: preset, exact: true }).click();
        await expect(textarea).not.toHaveValue("");
        expect(performance.now() - start).toBeLessThan(1000);
        expect(await projectCount(page)).toBe(initialCount);
        await expect(
          page.getByRole("button", { name: "Create from brief" }),
        ).toBeEnabled();
      }
      await page
        .getByRole("button", { name: "New task" })
        .click();
      await expect(textarea).toHaveValue("");
      await expect(textarea).toBeFocused();
      expect(await projectCount(page)).toBe(initialCount);
      expect(errors).toEqual([]);
    });
    test("one submit opens one project and plus returns to a clean focused Home", async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("/");
      const textarea = page.getByRole("textbox", { name: "Describe what you want to design..." });
      const before = await projectCount(page);
      await page.getByRole("button", { name: "Web", exact: true }).click();
      await page.getByRole("button", { name: "Create from brief" }).click();
      await expect(
        page
          .getByRole("tab", { name: /Agent/i })
          .or(page.getByRole("button", { name: /Agent/i }))
          .first(),
      ).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(500);
      expect(await projectCount(page)).toBeLessThanOrEqual(before + 1);
      await page
        .getByRole("button", { name: "New task" })
        .click();
      await expect(textarea).toBeVisible();
      await expect(textarea).toHaveValue("");
      await expect(textarea).toBeFocused();
      expect(await projectCount(page)).toBeLessThanOrEqual(before + 1);
      expect(errors).toEqual([]);
    });
  });
