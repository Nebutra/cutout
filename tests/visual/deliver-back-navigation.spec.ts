import { expect, test, type Page, type TestInfo } from "@playwright/test";

async function enterDeliver(page: Page, testInfo: TestInfo) {
  if (testInfo.project.name === "mobile-chrome") await page.setViewportSize({ width: 1024, height: 915 });
  await page.getByRole("button", { name: "Deliver", exact: true }).click();
  if (testInfo.project.name === "mobile-chrome") await page.setViewportSize({ width: 412, height: 915 });
  const deliver = page.locator('[data-slot="design-os-workbench"][aria-label="Deliver"]');
  await expect(deliver).toBeVisible();
  return deliver;
}

test("Deliver always returns to the same stateful project workspace", async ({ page }, testInfo) => {
  await page.goto("/");
  const brief = "Return to this exact canvas and Agent state";
  await page.getByRole("textbox", { name: "Describe what you want to design..." }).fill(brief);
  await page.getByRole("button", { name: "Create from brief" }).click();
  await expect(page.getByText("No result yet", { exact: true })).toBeVisible();
  const composer = page.getByRole("textbox", { name: "Message the Agent" });
  await expect(composer).toHaveValue(brief);
  const workspace = page.locator('[data-slot="project-workspace-surface"]');
  await workspace.evaluate((element) => { (element as HTMLElement).dataset.persistenceProbe = "same-node"; });

  for (const [index, tabName] of ["Delivery center", "Kits", "Components", "Starter"].entries()) {
    const deliver = await enterDeliver(page, testInfo);
    const tabs = deliver.getByRole("tablist", { name: "Deliver sections" });
    await expect(tabs).toHaveCount(1);
    await tabs.getByRole("tab", { name: tabName }).click();
    const back = deliver.getByRole("button", { name: /Back to (Canvas|Agent)/ });
    await expect(back).toBeVisible();
    expect(await back.boundingBox()).not.toBeNull();
    expect(await deliver.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(workspace).toHaveAttribute("aria-hidden", "true");
    await expect(workspace).toHaveAttribute("inert", "");

    if (index === 0) {
      for (const dark of [false, true]) {
        await page.evaluate((enabled) => document.documentElement.classList.toggle("dark", enabled), dark);
        await expect(deliver).toHaveScreenshot(`deliver-with-back-${dark ? "dark" : "light"}.png`);
      }
    }

    await back.click();
    await expect(deliver).toHaveCount(0);
    await expect(page.getByText("No result yet", { exact: true })).toBeVisible();
    await expect(composer).toHaveValue(brief);
    await expect(workspace).toHaveAttribute("data-persistence-probe", "same-node");
    await expect(workspace).toHaveAttribute("aria-hidden", "false");
    await expect(page.getByRole("tablist", { name: "Deliver sections" })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});
