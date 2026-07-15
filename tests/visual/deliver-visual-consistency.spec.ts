import { expect, test, type Locator } from "@playwright/test";

test("Deliver tabs share the product visual language without becoming forms", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Describe what you want to design..." }).fill("Deliver visual consistency");
  await page.getByRole("button", { name: "Create from brief" }).click();
  if (testInfo.project.name === "mobile-chrome") await page.setViewportSize({ width: 1024, height: 915 });
  await page.getByRole("button", { name: "Deliver", exact: true }).click();
  if (testInfo.project.name === "mobile-chrome") await page.setViewportSize({ width: 412, height: 915 });

  const deliver = page.locator('[data-slot="design-os-workbench"][aria-label="Deliver"]');
  const tabs = deliver.getByRole("tablist", { name: "Deliver sections" });
  const back = deliver.getByRole("button", { name: /Back to (Canvas|Agent)/ });
  const topGeometry = await Promise.all([back, ...await tabs.getByRole("tab").all()].map(async (item) => await item.boundingBox()));
  expect(topGeometry.every(Boolean)).toBe(true);
  expect(topGeometry.some((box, index) => topGeometry.slice(index + 1).some((other) => box!.x < other!.x + other!.width && box!.x + box!.width > other!.x && box!.y < other!.y + other!.height && box!.y + box!.height > other!.y))).toBe(false);

  const surfaces: Array<{ tab: string; region: Locator; cta: RegExp }> = [
    { tab: "Delivery center", region: deliver.locator('[data-slot="delivery-center"]'), cta: /Preview delivery|Ask Agent to prepare deliverables|Add destination/ },
    { tab: "Kits", region: deliver.getByRole("region", { name: "Kit workspace" }), cta: /Review required preparation|Prepare required materials|Preview and export/ },
    { tab: "Components", region: deliver.getByRole("region", { name: "Components workspace" }), cta: /Prepare prototype|Declare components|Resolve governance issues|Approve and continue|Preview and export/ },
    { tab: "Starter", region: deliver.getByRole("region", { name: "Starter workspace" }), cta: /Prepare|Approve and continue|Export starter/ },
  ];

  const typography: Array<{ heading: string; description: string }> = [];
  for (const [index, surface] of surfaces.entries()) {
    await tabs.getByRole("tab", { name: surface.tab }).click();
    await expect(surface.region).toBeVisible();
    const heading = surface.region.locator("h3").first();
    const description = heading.locator("xpath=following-sibling::p[1]");
    typography.push(await heading.evaluate((node, descriptionNode) => ({
      heading: getComputedStyle(node).fontSize,
      description: getComputedStyle(descriptionNode as Element).fontSize,
    }), await description.elementHandle()));
    const cta = surface.region.getByRole("button", { name: surface.cta }).first();
    await expect(cta).toBeVisible();
    const advanced = surface.tab === "Delivery center"
      ? surface.region.getByText("Advanced delivery details", { exact: true })
      : surface.region.getByRole("button", { name: "Advanced" });
    await expect(advanced).toBeVisible();
    const facts = await surface.region.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const nestedCards = [...element.querySelectorAll('[data-slot="card"]')].some((card) => card.parentElement?.closest('[data-slot="card"]'));
      return { width: box.width, viewport: innerWidth, scrollFits: element.scrollWidth <= element.clientWidth, nestedCards };
    });
    expect(facts.width).toBeLessThanOrEqual(Math.min(768, facts.viewport));
    expect(facts.scrollFits).toBe(true);
    expect(facts.nestedCards).toBe(false);
    const ctaBox = await cta.boundingBox();
    expect(ctaBox!.height).toBeGreaterThanOrEqual(44);
    if (testInfo.project.name === "mobile-chrome") expect(ctaBox!.width).toBeGreaterThan(facts.width * 0.9);
    else expect(ctaBox!.width).toBeLessThan(facts.width * 0.9);

    if (index === surfaces.length - 1) {
      await advanced.click();
      await expect(surface.region.getByRole("textbox", { name: "Starter configuration JSON" })).toBeVisible();
    }
  }
  expect(new Set(typography.map((item) => item.heading))).toEqual(new Set(["16px"]));
  expect(new Set(typography.map((item) => item.description))).toEqual(new Set(["14px"]));

  const documentFits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  expect(documentFits).toBe(true);
  for (const dark of [false, true]) {
    await page.evaluate((enabled) => document.documentElement.classList.toggle("dark", enabled), dark);
    await expect(deliver).toHaveScreenshot(`deliver-visual-${dark ? "dark" : "light"}.png`);
  }
});
