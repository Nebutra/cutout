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
  await expect(
    page.getByRole("button", { name: "Open advanced audit" }),
  ).toHaveCount(0);

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
      advanced: false,
    });
  });
}

test("Developer mode restores an accessible redacted audit without changing primary navigation", async ({
  page,
}) => {
  await page.addInitScript(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({ version: 2, mode: "agent", advanced: true }),
      ),
    navigationKey,
  );
  await createProject(page, "Audit a local design project");
  await expectOnlyPrimaryModes(page);
  const viewport = page.viewportSize()!;
  if (viewport.width < 768) await page.setViewportSize({ width: 1024, height: viewport.height });
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  if (viewport.width < 768) await page.setViewportSize(viewport);
  const dialog = page.getByRole("dialog", { name: "Developer audit" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab")).toHaveCount(2);
  await expect(dialog.getByRole("tab").allTextContents()).resolves.toEqual([
    "Design IR",
    "Receipts",
  ]);
  await expect(
    dialog.getByText(
      /Prompts, source content, secrets and local paths are excluded/,
    ),
  ).toBeVisible();
  const link = dialog.getByRole("link", { name: "Export redacted report" }),
    href = await link.getAttribute("href");
  expect(href).toMatch(/^data:application\/json/);
  const report = decodeURIComponent(href!.split(",")[1]!),
    serialized = report.toLowerCase();
  expect(serialized).not.toMatch(
    /api.?key|authorization|prompt|sourcecontent|localpath|secret/,
  );
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
