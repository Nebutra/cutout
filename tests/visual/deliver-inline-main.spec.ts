import { expect, test } from "@playwright/test";
import { openDeliverWorkspace, openProjectTool } from "./workspace-helpers";

test("Deliver opens the single Project workbench without an intermediate drawer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Describe what you want to design..." }).fill("Inline delivery regression");
  await page.getByRole("button", { name: "Create from brief" }).click();
  await openDeliverWorkspace(page);

  const deliver = page.locator('[data-slot="design-os-workbench"][aria-label="Project workbench"]');
  await expect(deliver).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Deliver" })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(deliver.getByText("Canvas inspector", { exact: true })).toHaveCount(0);
  await expect(deliver.getByText("Axe host required", { exact: true })).toHaveCount(0);
  const lifecycle = deliver.getByRole("tablist", { name: "Project lifecycle" });
  await expect(lifecycle.getByRole("tab").allTextContents()).resolves.toEqual([
    "Brief", "Sources", "Create", "Review", "Deliver", "Inspect",
  ]);
  const lifecycleGeometry = await lifecycle.evaluate((list) => {
    const viewport = list.parentElement!.getBoundingClientRect();
    const active = list.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')!
      .getBoundingClientRect();
    return {
      activeLeft: active.left,
      activeRight: active.right,
      viewportLeft: viewport.left,
      viewportRight: viewport.right,
    };
  });
  expect(lifecycleGeometry.activeLeft).toBeGreaterThanOrEqual(lifecycleGeometry.viewportLeft);
  expect(lifecycleGeometry.activeRight).toBeLessThanOrEqual(lifecycleGeometry.viewportRight);
  const tabs = deliver.getByRole("tablist", { name: "Delivery views" });
  await expect(tabs).toHaveCount(1);
  await expect(tabs.getByRole("tab").allTextContents()).resolves.toEqual([
    "Overview", "Kits", "Components", "Starter",
  ]);

  await tabs.getByRole("tab", { name: "Overview" }).click();
  await expect(deliver.locator('[data-slot="delivery-center"]')).toBeVisible();
  const deliveryAdvanced = deliver.getByText("Advanced delivery details", { exact: true });
  await deliveryAdvanced.click();

  await tabs.getByRole("tab", { name: "Kits" }).click();
  const kits = deliver.getByRole("region", { name: "Kit workspace" });
  await expect(kits).toBeVisible();
  await kits.getByRole("radio", { name: "Brand VI" }).click();
  await kits.getByRole("button", { name: "Advanced" }).click();

  await tabs.getByRole("tab", { name: "Components" }).click();
  const components = deliver.getByRole("region", { name: "Components workspace" });
  await components.getByRole("button", { name: "Advanced" }).click();
  await expect(components.getByRole("textbox", { name: "Component declarations JSON" })).toBeVisible();

  await tabs.getByRole("tab", { name: "Starter" }).click();
  const starter = deliver.getByRole("region", { name: "Starter workspace" });
  await starter.getByRole("radio", { name: "Vite" }).click();
  await starter.getByRole("button", { name: "Advanced" }).click();
  await expect(starter.getByRole("textbox", { name: "Starter configuration JSON" })).toBeVisible();

  const geometry = await deliver.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      left: box.left, right: box.right, top: box.top, bottom: box.bottom,
      viewportWidth: innerWidth, viewportHeight: innerHeight,
      documentFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      selfFits: element.scrollWidth <= element.clientWidth,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.documentFits).toBe(true);
  expect(geometry.selfFits).toBe(true);
  for (const dark of [false, true]) {
    await page.evaluate((enabled) => document.documentElement.classList.toggle("dark", enabled), dark);
    await expect(deliver).toHaveScreenshot(`deliver-inline-${dark ? "dark" : "light"}.png`);
  }

  await page.getByRole("button", { name: "Back to Agent" }).click();
  await expect(deliver).toHaveCount(0);
  await expect(
    page.getByRole("complementary", { name: "Agent workspace" }),
  ).toBeVisible();
  await openProjectTool(page, "DESIGN.md");
  const canvasInspector = page.getByRole("complementary", { name: "Design system" });
  await expect(canvasInspector).toBeVisible();
  const designDrawerBox = await canvasInspector.boundingBox();
  expect(designDrawerBox).not.toBeNull();
  const projectButton = page.getByRole("button", { name: "Project", exact: true });
  await expect(projectButton).toHaveAttribute("aria-pressed", "true");
  await openProjectTool(page, "DESIGN.md");
  await expect(canvasInspector).toHaveCount(0);
  await expect(projectButton).toHaveAttribute("aria-pressed", "false");
  await openProjectTool(page, "DESIGN.md");
  await expect(canvasInspector).toBeVisible();
  expect(await canvasInspector.innerText()).not.toMatch(/revision|provenance|host|json/i);
  await expect(canvasInspector.getByText("Advanced design system")).toHaveCount(0);
  await canvasInspector.getByRole("button", { name: "Open Product UI/UX" }).click();
  await expect(canvasInspector).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Project workbench" })).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Agent workspace" })).toBeVisible();
});
