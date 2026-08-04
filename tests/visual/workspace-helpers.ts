import { expect, type Page } from "@playwright/test";

export async function openDeliverWorkspace(page: Page) {
  const deliverButton = page.getByRole("button", {
    name: "Deliver",
    exact: true,
  });
  await deliverButton.click();
  await expect(deliverButton).toHaveAttribute("aria-pressed", "true");

  const drawer = page.getByRole("complementary", { name: "Deliver" });
  await expect(drawer).toBeVisible();
  await drawer
    .getByRole("button", { name: "Open delivery workspace" })
    .click();
}
