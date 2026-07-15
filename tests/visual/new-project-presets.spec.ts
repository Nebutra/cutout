import { expect, test } from "./local-state.fixture";

test("new project and presets are fast idempotent draft actions", async ({
  page,
}) => {
  const consoleErrors: string[] = [],
    pageErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    (globalThis as any).__longTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        (globalThis as any).__longTasks.push(entry.duration);
    }).observe({ entryTypes: ["longtask"] });
  });
  await page.goto("/");
  for (const database of await page.evaluate(() => indexedDB.databases()))
    if (database.name)
      await page.evaluate(
        (name) =>
          new Promise<void>((resolve) => {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess =
              request.onerror =
              request.onblocked =
                () => resolve();
          }),
        database.name,
      );
  await page.reload();
  const composer = page.getByRole("textbox", {
      name: "Describe what you want to design...",
    }),
    submit = page.getByRole("button", { name: "Create from brief" });
  for (const label of [
    "Web",
    "Mobile app",
    "Mini program",
    "Desktop",
    "Brand kit",
    "Poster",
  ]) {
    const started = Date.now();
    await page.getByRole("button", { name: label, exact: true }).click();
    expect(Date.now() - started).toBeLessThan(500);
    await expect(composer).toBeFocused();
    expect(await composer.inputValue(), label).not.toBe("");
    await expect(
      page.getByRole("complementary", { name: "Agent workspace" }),
    ).toHaveCount(0);
    await expect(submit).toBeEnabled();
  }
  const unique = `Create exactly one project ${Date.now()}`;
  await composer.fill(unique);
  await submit.dblclick();
  await expect(
    page.getByRole("complementary", { name: "Agent workspace" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New task" }).click();
  await expect(composer).toBeVisible();
  await expect(composer).toBeFocused();
  await expect(composer).toHaveValue("");
  await page.getByRole("button", { name: "New task" }).click();
  await expect(composer).toBeFocused();
  await page.getByRole("button", { name: /^All projects\b/ }).click();
  const directory = page.getByRole("heading",{name:"Your projects"}).locator("../../..");
  await expect(
    directory.getByRole("button", { name: `Open ${unique}` }),
  ).toHaveCount(1);
  await expect(
    directory.getByRole("button", { name: "Open Untitled project" }),
  ).toHaveCount(0);
  const longTasks = await page.evaluate(
    () => (globalThis as any).__longTasks as number[],
  );
  expect(longTasks.filter((duration) => duration >= 500)).toHaveLength(0);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter((value) => !value.includes("favicon"))).toEqual(
    [],
  );
});
