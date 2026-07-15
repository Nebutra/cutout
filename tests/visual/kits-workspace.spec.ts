import { expect, test } from "@playwright/test";
test("Kits stay outcome-first and preserve gated callbacks", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "mobile-chrome") {
    await page.setViewportSize({ width: 1024, height: 915 });
  }
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Describe what you want to design..." })
    .fill("Kit UX regression");
  await page.getByRole("button", { name: "Create from brief" }).click();
  await page.getByRole("button", { name: "Deliver", exact: true }).click();
  if (testInfo.project.name === "mobile-chrome") {
    await page.setViewportSize({ width: 412, height: 915 });
  }
  const workbench = page.getByRole("region", { name: "Deliver" });
  await workbench.getByRole("tab", { name: "Kits" }).click();
  const kits = workbench.getByRole("region", { name: "Kit workspace" });
  await expect(kits).toBeVisible();
  await expect(kits.getByRole("textbox")).toHaveCount(0);
  await expect(kits.getByText("Import JSON", { exact: true })).toHaveCount(0);
  await expect(kits.getByText(/Design IR|raw readiness/i)).toHaveCount(0);
  await expect(
    kits.getByText(/Ready|Needs preparation/, { exact: true }),
  ).toHaveCount(1);
  for (const label of ["Design System", "Brand VI", "Both"]) {
    const choice = kits.getByRole("radio", { name: label });
    await choice.click();
    await expect(choice).toHaveAttribute("aria-checked", "true");
  }
  const cta = kits.locator("button.w-full");
  await expect(cta).toHaveCount(1);
  await cta.click();
  await expect(kits.locator("button.w-full")).toHaveCount(1);
  await kits.getByRole("button", { name: "Advanced" }).click();
  await expect(
    kits.getByRole("textbox", { name: "Brand configuration JSON" }),
  ).toBeVisible();
  await expect(kits.getByText("Import JSON", { exact: true })).toBeVisible();
  await expect(
    kits.getByText(/License, provenance, and raw readiness/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  for (const dark of [false, true]) {
    await page.evaluate(
      (enabled) => document.documentElement.classList.toggle("dark", enabled),
      dark,
    );
    await expect(kits).toHaveScreenshot(`kits-${dark ? "dark" : "light"}.png`);
  }
});
