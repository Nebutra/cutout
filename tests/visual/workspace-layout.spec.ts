import { expect, test } from "@playwright/test";
import { openDeliverWorkspace } from "./workspace-helpers";
async function project(page: import("@playwright/test").Page) {
  const viewport = page.viewportSize();
  if (viewport && viewport.width < 768) {
    await page.setViewportSize({ width: 1024, height: viewport.height });
  }
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Describe what you want to design..." })
    .fill("Components UX regression");
  await page.getByRole("button", { name: "Create from brief" }).click();
  await expect(page.getByRole("complementary", { name: "Agent workspace" })).toBeVisible();
  if (viewport && viewport.width < 768) {
    await page.setViewportSize(viewport);
  }
}
test("workspace modes use stable non-overlapping geometry", async ({
  page,
}) => {
  await project(page);
  const viewport = page.viewportSize()!;
  for (const dark of [false, true]) {
    if (viewport.width < 768) await page.setViewportSize({ width: 1024, height: viewport.height });
    const agentToggle = page.getByRole("button", { name: "Agent", exact: true });
    if (await agentToggle.isVisible() && await agentToggle.getAttribute("aria-pressed") !== "true") {
      await agentToggle.click();
    }
    if (viewport.width < 768) await page.setViewportSize(viewport);
    await page.evaluate(
      (enabled) => document.documentElement.classList.toggle("dark", enabled),
      dark,
    );
    const agent = page.getByRole("complementary", { name: "Agent workspace" }),
      composer = agent.locator('[data-slot="agent-composer"]');
    await expect(agent).toBeVisible();
    const agentBox = await agent.boundingBox(),
      composerBox = await composer.boundingBox();
    expect(agentBox).not.toBeNull();
    expect(composerBox).not.toBeNull();
    expect(agentBox!.width).toBeLessThanOrEqual(900);
    expect(agentBox!.width).toBeGreaterThan(Math.min(360, viewport.width - 24));
    expect(agentBox!.x).toBeGreaterThanOrEqual(0);
    expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(
      viewport.height,
    );
    await expect(
      page.getByRole("main").getByRole("heading", { name: "Output" }),
    ).toHaveCount(0);
    const output = page.getByRole("main");
    await expect(output).toBeVisible();
    const outputBox = await output.boundingBox();
    expect(outputBox!.width).toBeGreaterThan(viewport.width * 0.7);
    await expect(output).toHaveScreenshot(
      `workspace-canvas-${dark ? "dark" : "light"}.png`,
      { mask: [output.locator(":scope > *")] },
    );
    if (viewport.width < 768) await page.setViewportSize({ width: 1024, height: viewport.height });
    await openDeliverWorkspace(page);
    if (viewport.width < 768) await page.setViewportSize(viewport);
    const deliver = page.getByRole("region", { name: "Project workbench" });
    await expect(deliver).toBeVisible();
    const deliverBox = await deliver.boundingBox();
    expect(deliverBox!.width).toBeGreaterThan(viewport.width * 0.8);
    await expect(deliver).toHaveScreenshot(
      `workspace-deliver-${dark ? "dark" : "light"}.png`,
      { mask: [deliver.locator(":scope > *")] },
    );
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: /^Back( to (Agent|Canvas))?$/ }).first().click();
  }
});
