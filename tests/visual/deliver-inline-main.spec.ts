import { expect, test, type Page } from "@playwright/test";

const navigationKey = "cutout.workspace-navigation.v2";
const navigationEvent = "cutout:workspace-navigation";

async function navigate(page: Page, value: object) {
  await page.evaluate(({ key, event, next }) => {
    localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new Event(event));
  }, { key: navigationKey, event: navigationEvent, next: value });
}

test("Deliver is one inline responsive workspace while inspectors stay separate", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Describe what you want to design..." }).fill("Inline delivery regression");
  await page.getByRole("button", { name: "Create from brief" }).click();
  if (testInfo.project.name === "mobile-chrome") await page.setViewportSize({ width: 1024, height: 915 });
  await page.getByRole("button", { name: "Deliver", exact: true }).click();
  if (testInfo.project.name === "mobile-chrome") await page.setViewportSize({ width: 412, height: 915 });

  const deliver = page.locator('[data-slot="design-os-workbench"][aria-label="Deliver"]');
  await expect(deliver).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(deliver.getByText("Canvas inspector", { exact: true })).toHaveCount(0);
  await expect(deliver.getByText("Axe host required", { exact: true })).toHaveCount(0);
  const tabs = deliver.getByRole("tablist", { name: "Deliver sections" });
  await expect(tabs).toHaveCount(1);
  await expect(tabs.getByRole("tab").allTextContents()).resolves.toEqual([
    "Delivery center", "Kits", "Components", "Starter",
  ]);

  await tabs.getByRole("tab", { name: "Delivery center" }).click();
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

  await navigate(page, { version: 2, mode: "canvas", advanced: false });
  await expect(deliver).toHaveCount(0);
  if (testInfo.project.name === "mobile-chrome") await page.setViewportSize({ width: 1024, height: 915 });
  await page.getByRole("button", { name: "Design", exact: true }).click();
  const canvasInspector = page.getByRole("complementary", { name: "Design system" });
  await expect(canvasInspector).toBeVisible();
  expect(await canvasInspector.innerText()).not.toMatch(/revision|provenance|host|json/i);
  await canvasInspector.getByText("Advanced design system", { exact: true }).click();
  await canvasInspector.getByRole("button", { name: "Open system inspector" }).click();
  const inspector = page.getByRole("dialog", { name: "System inspector" });
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole("tablist", { name: "Deliver sections" })).toHaveCount(0);
  await expect(inspector.getByRole("tab", { name: /Delivery center|Kits|Components|Starter/ })).toHaveCount(0);
  await expect(inspector.getByText("System inspector", { exact: true }).first()).toBeVisible();
  await inspector.getByRole("button", { name: "Close" }).click();

  await navigate(page, { version: 2, mode: "canvas", advanced: true });
  await page.getByRole("button", { name: /Open advanced audit|Advanced/, exact: true }).click();
  const developer = page.getByRole("dialog", { name: "Developer audit" });
  await developer.getByText("Host diagnostics", { exact: true }).click();
  await expect(developer.getByText(/Axe host (available|unavailable)/)).toBeVisible();
});
