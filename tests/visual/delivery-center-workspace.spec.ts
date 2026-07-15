import { expect, test } from "@playwright/test";

test("Delivery stays outcome-first and keeps preview approval real", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "mobile-chrome") {
    await page.setViewportSize({ width: 1024, height: 915 });
  }
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Describe what you want to design..." })
    .fill("Delivery UX regression");
  await page.getByRole("button", { name: "Create from brief" }).click();
  await page.getByRole("button", { name: "Deliver", exact: true }).click();
  if (testInfo.project.name === "mobile-chrome") {
    await page.setViewportSize({ width: 412, height: 915 });
  }

  const workbench = page.getByRole("region", { name: "Deliver" });
  await workbench.getByRole("tab", { name: "Delivery center" }).click();
  const delivery = workbench.locator('[data-slot="delivery-center"]');
  await expect(delivery).toBeVisible();
  await expect(delivery.getByText("Choose a result", { exact: true })).toBeVisible();
  await expect(delivery.getByText("Choose a destination", { exact: true })).toBeVisible();
  await expect(delivery.getByText("Ready to continue?", { exact: true })).toBeVisible();
  await expect(
    delivery.getByText(/Deliverable is approved and versioned\.?/, { exact: true }),
  ).toHaveCount(1);
  await expect(delivery.locator('[data-slot="delivery-preview"]')).toHaveCount(0);

  await expect(delivery.getByText("GitHub", { exact: true })).toHaveCount(0);
  await expect(delivery.getByText("Notion", { exact: true })).toHaveCount(0);
  const addDestination = delivery.locator("summary", {
    hasText: "Add destination",
  });
  await expect(addDestination).toBeVisible();
  await addDestination.click();
  await expect(delivery.getByText(/host session|adapter/i).first()).toBeVisible();

  const cta = delivery.getByRole("button", {
    name: /Preview delivery|Ask Agent to prepare deliverables/,
  });
  await expect(cta).toHaveCount(1);
  if ((await cta.textContent())?.includes("Preview") && await cta.isEnabled()) {
    await cta.click();
    await expect(delivery.locator('[data-slot="delivery-preview"]')).toBeVisible();
    const approve = delivery.getByRole("button", { name: "Approve and deliver" });
    if (await approve.isEnabled()) {
      await approve.click();
      await expect(
        delivery.locator('[data-slot="composite-delivery-receipt"]'),
      ).toBeVisible();
    }
  }

  await delivery.getByText("Advanced delivery details", { exact: true }).click();
  await expect(
    delivery.getByText(/Unavailable destination evidence|Approved preview evidence/, {
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
    await expect(delivery).toHaveScreenshot(
      `delivery-center-${dark ? "dark" : "light"}.png`,
    );
  }
});
