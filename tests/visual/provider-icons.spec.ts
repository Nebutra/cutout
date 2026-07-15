import { expect, test, type Page } from "@playwright/test";

async function openProviderDirectory(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: /Workspace menu|工作区菜单/ }).click();
  await page.getByRole("menuitem", { name: /Settings|设置/ }).click();
  await page.getByText("AI", { exact: true }).click();
  await page.getByRole("button", { name: "Connect provider" }).click();
  await page.getByRole("tab", { name: "All", exact: true }).click();
}

test("provider icons have inline pixels in light, dark, and scrolled states", async ({
  page,
}) => {
  await openProviderDirectory(page);
  const icons = page.locator("[data-provider-icon]");
  expect(await icons.count()).toBeGreaterThan(20);

  for (const dark of [false, true]) {
    await page.evaluate(
      (enabled) => document.documentElement.classList.toggle("dark", enabled),
      dark,
    );
    for (const icon of await icons.all()) {
      const facts = await icon.evaluate((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        const svg = element.matches("svg")
          ? element
          : element.querySelector("svg");
        const svgBox = svg?.getBoundingClientRect();
        return {
          width: box.width,
          height: box.height,
          color: style.color,
          maskImage: style.maskImage,
          svgWidth: svgBox?.width ?? 0,
          svgHeight: svgBox?.height ?? 0,
          hasGeometry: Boolean(
            svg?.querySelector("path, circle, rect, polygon, polyline"),
          ),
        };
      });
      expect(facts.width).toBe(20);
      expect(facts.height).toBe(20);
      expect(facts.svgWidth).toBe(20);
      expect(facts.svgHeight).toBe(20);
      expect(facts.maskImage).toBe("none");
      expect(facts.color).not.toBe("rgba(0, 0, 0, 0)");
      expect(facts.hasGeometry).toBe(true);
    }

    await icons.last().scrollIntoViewIfNeeded();
    await expect(icons.last()).toBeVisible();
    await expect(page).toHaveScreenshot(
      `provider-directory-${dark ? "dark" : "light"}.png`,
    );
  }
});

test("recommended providers have three distinct non-placeholder geometries", async ({
  page,
}) => {
  await openProviderDirectory(page);
  const icons = page.locator(
    '[data-provider-icon="openai"],[data-provider-icon="anthropic"],[data-provider-icon="google"]',
  );
  expect(await icons.count()).toBe(3);
  const geometry = await icons.evaluateAll((elements) =>
    elements.map((element) => ({
      id: element.getAttribute("data-provider-icon"),
      source: element.getAttribute("data-provider-icon-source"),
      label: element.getAttribute("aria-label"),
      path: [...element.querySelectorAll("path")]
        .map((path) => path.getAttribute("d"))
        .join("|"),
    })),
  );
  expect(new Set(geometry.map((item) => item.path)).size).toBe(3);
  expect(geometry.find((item) => item.id === "openai")).toMatchObject({
    source: "openai:logo",
    label: "OpenAI logo",
  });
  expect(
    geometry.find((item) => item.id === "openai")?.path.length,
  ).toBeGreaterThan(100);
  expect(geometry.every((item) => item.path.length > 20)).toBe(true);
});

test("all integrations have nonempty non-Plug icons in light/dark after scrolling", async ({
  page,
}) => {
  const targetViewport = page.viewportSize();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: /Workspace menu|工作区菜单/ }).click();
  await page.getByRole("menuitem", { name: /Settings|设置/ }).click();
  if (targetViewport) await page.setViewportSize(targetViewport);
  await page.getByText(/Integrations|集成/, { exact: true }).click();
  const icons = page.locator("[data-integration-icon]");
  expect(await icons.count()).toBe(9);
  await expect(page.locator("[data-integration-icon].lucide-plug")).toHaveCount(
    0,
  );
  await expect(
    page.locator('[data-integration-icon="cutout.canva"].lucide-palette'),
  ).toHaveCount(0);
  for (const dark of [false, true]) {
    await page.evaluate(
      (enabled) => document.documentElement.classList.toggle("dark", enabled),
      dark,
    );
    for (const icon of await icons.all()) {
      const facts = await icon.evaluate((element) => {
        const box = element.getBoundingClientRect(),
          svg = element.matches("svg") ? element : element.querySelector("svg");
        return {
          id: element.getAttribute("data-integration-icon"),
          source: element.getAttribute("data-icon-source"),
          width: box.width,
          height: box.height,
          svgWidth: svg?.getBoundingClientRect().width ?? 0,
          geometry: [
            ...(svg?.querySelectorAll("path,circle,rect,polygon,polyline") ??
              []),
          ].length,
          path: svg?.querySelector("path")?.getAttribute("d") ?? "",
          gradient: svg?.querySelector("linearGradient")?.id ?? "",
          fill: svg?.querySelector("path")?.getAttribute("fill") ?? "",
          color: getComputedStyle(element).color,
          plug: element.classList.contains("lucide-plug"),
        };
      });
      expect(facts).toMatchObject({
        width: 16,
        height: 16,
        svgWidth: 16,
        plug: false,
      });
      expect(facts.geometry).toBeGreaterThan(0);
      expect(facts.color).not.toBe("rgba(0, 0, 0, 0)");
      if (facts.id === "cutout.canva") {
        expect(facts.source).toBe("Canva Developers");
        expect(facts.path.length).toBeGreaterThan(1000);
        expect(facts.gradient).toBe("canva-a");
        expect(facts.fill).toBe("url(#canva-a)");
      }
    }
    await icons.last().scrollIntoViewIfNeeded();
    await expect(icons.last()).toBeVisible();
    await expect(page).toHaveScreenshot(
      `integration-icons-${dark ? "dark" : "light"}.png`,
    );
  }
});
