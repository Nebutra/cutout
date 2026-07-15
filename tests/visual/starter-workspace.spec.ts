import { expect, test } from "@playwright/test";
test("Starter stays outcome-first and progressively discloses technical evidence", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "mobile-chrome") {
    await page.setViewportSize({ width: 1024, height: 915 });
  }
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Describe what you want to design..." })
    .fill("Starter UX regression");
  await page.getByRole("button", { name: "Create from brief" }).click();
  await page.getByRole("button", { name: "Deliver", exact: true }).click();
  if (testInfo.project.name === "mobile-chrome") {
    await page.setViewportSize({ width: 412, height: 915 });
  }
  const workbench = page.getByRole("region", { name: "Deliver" });
  await workbench.getByRole("tab", { name: "Starter" }).click();
  const starter = workbench.getByRole("region", { name: "Starter workspace" });
  await expect(starter).toBeVisible();
  await expect(starter.getByText(/\{\s*"framework"/)).toHaveCount(0);
  await expect(starter.getByText("Import JSON", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    starter.getByText(/Ready|Needs preparation/, { exact: true }),
  ).toHaveCount(1);
  for (const label of ["Next.js", "Vite", "Nuxt", "TanStack"]) {
    const choice = starter.getByRole("radio", { name: label });
    await choice.click();
    await expect(choice).toHaveAttribute("aria-checked", "true");
  }
  const cta = starter.locator("button.w-full");
  await expect(cta).toHaveCount(1);
  await cta.click();
  await expect(
    starter.getByRole("button", {
      name: /Approve and continue|Export starter|Prepare/,
    }),
  ).toHaveCount(1);
  await starter.getByRole("button", { name: "Advanced" }).click();
  await expect(
    starter.getByText("Technical configuration", { exact: true }),
  ).toBeVisible();
  await expect(
    starter.getByRole("textbox", { name: "Starter configuration JSON" }),
  ).toHaveValue(/framework/);
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
    await expect(starter).toHaveScreenshot(
      `starter-${dark ? "dark" : "light"}.png`,
    );
  }
});
