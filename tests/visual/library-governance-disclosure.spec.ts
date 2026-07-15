import { expect, test } from "./local-state.fixture";
test("Library keeps governance progressive and keyboard-safe across themes", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Library" }).first().click();
  const library = page.getByRole("region", { name: "Global library" });
  await expect(library).toBeVisible();
  for (const text of [
    "Team",
    "Remote sync disabled",
    "Review branch",
    "Create read-only share",
  ])
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  const share = page.getByRole("button", { name: /Share and review/ });
  await expect(share).toBeVisible();
  for (const dark of [false, true]) {
    await page.evaluate(
      (enabled) => document.documentElement.classList.toggle("dark", enabled),
      dark,
    );
    await expect(library).toHaveScreenshot(
      `library-assets-${dark ? "dark" : "light"}.png`,
    );
  }
  await share.focus();
  await share.click();
  const shareDrawer = page.getByRole("dialog", { name: "Share and review" });
  await expect(shareDrawer).toBeVisible();
  await expect(shareDrawer.getByText("Local review", { exact: true })).toBeVisible();
  await expect(
    shareDrawer.getByText(/Open a project to start a review/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(shareDrawer).toHaveCount(0);
  await expect(share).toBeFocused();
});
