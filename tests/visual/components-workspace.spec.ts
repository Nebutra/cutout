import { expect, test } from "@playwright/test";

test("Components stays outcome-first and preserves the explicit-declaration gate", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Describe what you want to design..." })
    .fill("Components UX regression");
  await page.getByRole("button", { name: "Create from brief" }).click();
  if (testInfo.project.name === "mobile-chrome") {
    await page.setViewportSize({ width: 1024, height: 915 });
  }
  await page.getByRole("button", { name: "Deliver", exact: true }).click();
  if (testInfo.project.name === "mobile-chrome") {
    await page.setViewportSize({ width: 412, height: 915 });
  }

  const workbench = page.getByRole("region", { name: "Deliver" });
  await workbench.getByRole("tab", { name: "Components" }).click();
  const components = workbench.getByRole("region", {
    name: "Components workspace",
  });
  await expect(components).toBeVisible();

  await expect(components.getByRole("textbox")).toHaveCount(0);
  await expect(components.getByText("Import JSON", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    components.getByText(/Ready|Needs preparation/, { exact: true }),
  ).toHaveCount(1);
  await expect(
    components.getByRole("list", { name: "Component preparation checklist" }),
  ).toHaveCount(1);
  await expect(
    components.getByText(
      "Screenshots are reference material, never component declarations.",
      { exact: true },
    ),
  ).toBeVisible();

  const cta = components.locator("button.w-full");
  await expect(cta).toHaveCount(1);
  await expect(cta).toBeEnabled();
  await cta.click();
  await expect(components.locator("button.w-full")).toHaveCount(1);

  await components.getByRole("button", { name: "Advanced" }).click();
  await expect(
    components.getByRole("textbox", { name: "Component declarations JSON" }),
  ).toBeVisible();
  await expect(
    components.getByText("Import JSON", { exact: true }),
  ).toBeVisible();
  await expect(
    components.getByText("Manifest, adapter plan, and receipt evidence", {
      exact: true,
    }),
  ).toBeVisible();

  const geometry = await page.evaluate(() => ({
    documentFits:
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
    bodyFits: document.body.scrollWidth <= document.body.clientWidth,
  }));
  expect(geometry).toEqual({ documentFits: true, bodyFits: true });

  for (const dark of [false, true]) {
    await page.evaluate(
      (enabled) => document.documentElement.classList.toggle("dark", enabled),
      dark,
    );
    await expect(components).toHaveScreenshot(
      `components-${dark ? "dark" : "light"}.png`,
    );
  }
});
