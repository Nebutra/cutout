import { expect, test } from "./local-state.fixture";

test("minimum desktop window keeps Home and workspace geometry usable", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome");
  await page.setViewportSize({ width: 1040, height: 720 });
  await page.goto("/");

  const surface = page.getByTestId("home-composer-surface");
  const actions = page.getByTestId("home-composer-actions");
  await expect(surface).toBeVisible();
  await expect(actions).toBeVisible();

  const homeGeometry = await page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>(
      '[data-testid="home-composer-surface"]',
    )!;
    const actions = document.querySelector<HTMLElement>(
      '[data-testid="home-composer-actions"]',
    )!;
    const surfaceBox = surface.getBoundingClientRect();
    const actionBoxes = [...actions.querySelectorAll("button")].map((button) =>
      button.getBoundingClientRect(),
    );
    return {
      noHorizontalOverflow:
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
      surfaceInsideViewport:
        surfaceBox.left >= 0 && surfaceBox.right <= window.innerWidth,
      actionsInsideSurface: actionBoxes.every(
        (box) => box.left >= surfaceBox.left && box.right <= surfaceBox.right,
      ),
      actionsDoNotOverlap: actionBoxes.every((box, index) =>
        actionBoxes.slice(index + 1).every(
          (other) =>
            box.right <= other.left ||
            other.right <= box.left ||
            box.bottom <= other.top ||
            other.bottom <= box.top,
        ),
      ),
    };
  });
  expect(homeGeometry).toEqual({
    noHorizontalOverflow: true,
    surfaceInsideViewport: true,
    actionsInsideSurface: true,
    actionsDoNotOverlap: true,
  });

  await page
    .getByRole("textbox", { name: "Describe what you want to design..." })
    .fill("Minimum desktop layout verification");
  await page.getByRole("button", { name: "Create from brief" }).click();

  const agent = page.getByRole("complementary", { name: "Agent workspace" });
  const output = page.getByRole("main");
  const composer = agent.locator('[data-slot="agent-composer"]');
  await expect(agent).toBeVisible();
  await expect(output).toBeVisible();
  await expect(composer).toBeVisible();

  const [agentBox, outputBox, composerBox] = await Promise.all([
    agent.boundingBox(),
    output.boundingBox(),
    composer.boundingBox(),
  ]);
  expect(agentBox).not.toBeNull();
  expect(outputBox).not.toBeNull();
  expect(composerBox).not.toBeNull();
  expect(agentBox!.x).toBeGreaterThanOrEqual(0);
  expect(agentBox!.x + agentBox!.width).toBeLessThanOrEqual(1040);
  expect(outputBox!.x).toBeGreaterThanOrEqual(0);
  expect(outputBox!.x + outputBox!.width).toBeLessThanOrEqual(1040);
  expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(720);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
