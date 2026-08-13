import { test, expect } from "./local-state.fixture";
import { projectCount } from "./project-storage";
const presets = [
  "Web",
  "Mobile app",
  "Mini program",
  "Desktop",
  "Brand kit",
  "Poster",
] as const;
for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
])
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });
    test("presets only prepare the brief and New project opens a clean workspace", async ({
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
        .getByRole("button", { name: "New project" })
        .click();
      await expect(
        page.getByRole("complementary", { name: "Agent workspace" }),
      ).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Message the Agent" })).toHaveValue("");
      await expect(textarea).toHaveCount(0);
      expect(await projectCount(page)).toBe(initialCount);
      expect(errors).toEqual([]);
    });
    test("one submit persists one project and New project opens a clean blank workspace", async ({
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
        .getByRole("button", { name: "New project" })
        .click();
      await expect(
        page.getByRole("complementary", { name: "Agent workspace" }),
      ).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Message the Agent" })).toHaveValue("");
      await expect(page.getByRole("button", { name: "Untitled project", exact: true })).toBeVisible();
      await expect(textarea).toHaveCount(0);
      expect(await projectCount(page)).toBeLessThanOrEqual(before + 1);
      expect(errors).toEqual([]);
    });
  });
