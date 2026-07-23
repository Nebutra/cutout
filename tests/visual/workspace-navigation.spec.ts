import { expect, test, type Page } from "@playwright/test";

const navigationKey = "cutout.workspace-navigation.v2";

async function createProject(
  page: Page,
  _brief = "Components UX regression",
) {
  const viewport = page.viewportSize();
  if (viewport && viewport.width < 768) {
    await page.setViewportSize({ width: 1024, height: viewport.height });
  }
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Describe what you want to design..." })
    .fill("Components UX regression");
  await page.getByRole("button", { name: "Create from brief" }).click();
  if (viewport && viewport.width < 768) {
    await page.setViewportSize(viewport);
  }
  await expect(page.getByRole("banner")).toContainText("Components UX regression");
}

async function expectOnlyPrimaryModes(page: Page) {
  const nav = page.getByRole("navigation", { name: "Workspace panels" });
  if (await nav.isVisible()) {
    for (const name of ["Agent", "Design", "Deliver"]) {
      await expect(nav.getByRole("button", { name, exact: true })).toBeVisible();
    }
  } else {
    await expect(
      page.getByRole("button", { name: "Hide Agent" }).or(page.getByRole("region", { name: "Deliver" })),
    ).toBeVisible();
  }
  await expect(nav.getByText("Design OS", { exact: true })).toHaveCount(0);
  await expect(
    page
      .locator('[data-slot="design-os-workbench"]')
      .getByText("Design OS", { exact: true }),
  ).toHaveCount(0);
}

test("Agent, Design and Deliver retain their consumers in the workspace panel rail", async ({
  page,
}) => {
  await createProject(page);
  await expectOnlyPrimaryModes(page);

  await expect(page.getByLabel("Message the Agent")).toBeVisible();
  const viewport = page.viewportSize()!;
  if (viewport.width < 768) await page.setViewportSize({ width: 1024, height: viewport.height });
  await page.getByRole("button", { name: "Deliver", exact: true }).click();
  if (viewport.width < 768) await page.setViewportSize(viewport);
  const deliver = page.getByRole("region", { name: "Deliver" });
  await expect(deliver).toBeVisible();
  const deliverTabs = deliver.getByRole("tablist", {
    name: "Deliver sections",
  });
  await expect(deliverTabs.getByRole("tab").allTextContents()).resolves.toEqual(
    ["Delivery center", "Kits", "Components", "Starter"],
  );
  await expect(
    deliver.getByText("Deliver results", { exact: true }),
  ).toBeVisible();
  await deliver.getByRole("tab", { name: "Kits" }).click();
  await expect(
    deliver.getByRole("region", { name: "Kit workspace" }),
  ).toBeVisible();
  await deliver.getByRole("tab", { name: "Starter" }).click();
  await expect(
    deliver.getByRole("region", { name: "Starter workspace" }),
  ).toBeVisible();

  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await expect(deliver).toHaveScreenshot("workspace-navigation.png");
});

test("collapsing the workspace rail does not leave a dead gutter beside the Agent drawer", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome");
  await createProject(page, "Rail collapse regression");

  const workspace = page.locator("[data-workspace-root]");
  const railFrame = page.locator("[data-workspace-rail]");
  const rail = page.getByRole("navigation", { name: "Workspace panels" });
  const drawer = page.locator('[data-workspace-panel="agent-drawer"]');
  await expect(rail).toBeVisible();
  await expect(drawer).toBeVisible();

  const expanded = await Promise.all([
    workspace.boundingBox(),
    rail.boundingBox(),
    drawer.boundingBox(),
  ]);
  expect(expanded.every(Boolean)).toBe(true);
  expect(Math.abs(expanded[2]!.x - (expanded[1]!.x + expanded[1]!.width))).toBeLessThanOrEqual(1);

  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  await expect.poll(async () => (await railFrame.boundingBox())?.width).toBe(0);
  await expect.poll(async () => (await drawer.boundingBox())?.x).toBe(expanded[0]!.x);

  await page.setViewportSize({ width: 1100, height: 720 });
  await expect.poll(async () => (await drawer.boundingBox())?.x).toBe(0);

  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(rail).toBeVisible();
  await expect.poll(async () => {
    const railBox = await rail.boundingBox();
    const drawerBox = await drawer.boundingBox();
    return railBox && drawerBox
      ? Math.abs(drawerBox.x - (railBox.x + railBox.width))
      : Number.POSITIVE_INFINITY;
  }).toBeLessThanOrEqual(1);
});

for (const [legacyView, expectedMode] of [
  ["figma", "Design"],
  ["kits", "Deliver"],
] as const) {
  test(`legacy ${legacyView} deep link lands safely on ${expectedMode}`, async ({
    page,
  }) => {
    await page.addInitScript(
      ([key, view]) =>
        localStorage.setItem(key, JSON.stringify({ designOsView: view })),
      [navigationKey, legacyView] as const,
    );
    await createProject(page, `Migrate legacy ${legacyView} workspace`);
    await expectOnlyPrimaryModes(page);
    if (expectedMode === "Deliver") {
      await expect(page.getByRole("region", { name: "Deliver" })).toBeVisible();
    } else {
      await expect(page.getByRole("main")).toBeVisible();
    }
    const persisted = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
      navigationKey,
    );
    expect(persisted).toMatchObject({
      version: 2,
      mode: expectedMode === "Design" ? "canvas" : expectedMode.toLowerCase(),
    });
    expect(persisted).not.toHaveProperty("advanced");
  });
}
