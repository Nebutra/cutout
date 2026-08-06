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
    const preset = page.getByRole("button", { name: label, exact: true });
    await preset.evaluate((button) => {
      const composer = document.querySelector<HTMLTextAreaElement>("textarea");
      if (!composer) throw new Error("Home composer is unavailable");
      const previous = composer.value;
      (globalThis as any).__presetResponseMs = null;
      button.addEventListener(
        "click",
        () => {
          const started = performance.now();
          const observeCommit = () => {
            if (composer.value !== previous) {
              (globalThis as any).__presetResponseMs = performance.now() - started;
              return;
            }
            requestAnimationFrame(observeCommit);
          };
          requestAnimationFrame(observeCommit);
        },
        { once: true },
      );
    });
    await preset.click();
    await page.waitForFunction(
      () => typeof (globalThis as any).__presetResponseMs === "number",
    );
    const responseMs = await page.evaluate(
      () => (globalThis as any).__presetResponseMs as number,
    );
    expect(responseMs).toBeLessThan(500);
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
  await page.getByRole("button", { name: "New project" }).click();
  const agentComposer = page.getByRole("textbox", { name: "Message the Agent" });
  await expect(agentComposer).toBeVisible();
  await expect(agentComposer).toHaveValue("");
  await expect(page.getByRole("button", { name: "Untitled project", exact: true })).toBeVisible();
  await expect(composer).toHaveCount(0);
  await page.getByRole("button", { name: "New project" }).click();
  await expect(agentComposer).toBeVisible();
  await expect(agentComposer).toHaveValue("");
  await page.getByRole("button", { name: "Home", exact: true }).click();
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
