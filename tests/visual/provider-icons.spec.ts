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
  const lightSimpleIconColors = new Map<string, string>();
  for (const dark of [false, true]) {
    await page.evaluate(
      (enabled) => document.documentElement.classList.toggle("dark", enabled),
      dark,
    );
    for (const icon of await icons.all()) {
      const facts = await icon.evaluate((element) => {
        const box = element.getBoundingClientRect(),
          svg = element.matches("svg") ? element : element.querySelector("svg"),
          image = element.querySelector("img");
        return {
          id: element.getAttribute("data-integration-icon"),
          source: element.getAttribute("data-icon-source"),
          kind: element.getAttribute("data-icon-kind"),
          width: box.width,
          height: box.height,
          svgWidth: svg?.getBoundingClientRect().width ?? 0,
          svgHeight: svg?.getBoundingClientRect().height ?? 0,
          imageWidth: image?.getBoundingClientRect().width ?? 0,
          imageHeight: image?.getBoundingClientRect().height ?? 0,
          naturalWidth: image?.naturalWidth ?? 0,
          naturalHeight: image?.naturalHeight ?? 0,
          geometry: [
            ...(svg?.querySelectorAll("path,circle,rect,polygon,polyline") ??
              []),
          ].length,
          path: svg?.querySelector("path")?.getAttribute("d") ?? "",
          gradient: svg?.querySelector("linearGradient")?.id ?? "",
          fill: svg?.querySelector("path")?.getAttribute("fill") ?? "",
          pathFill: svg?.querySelector("path")
            ? getComputedStyle(svg.querySelector("path")!).fill
            : "",
          color: getComputedStyle(element).color,
          plug: element.classList.contains("lucide-plug"),
        };
      });
      expect(facts).toMatchObject({ width: 20, height: 20, plug: false });
      expect(facts.color).not.toBe("rgba(0, 0, 0, 0)");
      if (facts.kind === "image") {
        expect(facts.imageWidth).toBe(20);
        expect(facts.imageHeight).toBe(20);
        expect(facts.naturalWidth).toBeGreaterThan(0);
        expect(facts.naturalHeight).toBeGreaterThan(0);
      } else {
        expect(facts.svgWidth).toBe(20);
        expect(facts.svgHeight).toBe(20);
        expect(facts.geometry).toBeGreaterThan(0);
      }
      if (facts.id === "cutout.canva") {
        expect(facts.source).toBe("Canva Developers");
        expect(facts.path.length).toBeGreaterThan(1000);
        expect(facts.gradient).toBe("canva-a");
        expect(facts.fill).toBe("url(#canva-a)");
      } else if (facts.id === "cutout.pencil") {
        expect(facts.source).toBe("pen.dev");
      } else if (facts.id === "cutout.paper") {
        expect(facts.source).toBe("paper.design");
      } else if (facts.kind === "monochrome-svg") {
        expect(facts.pathFill).toBe(facts.color);
        if (dark) {
          expect(facts.color).not.toBe(lightSimpleIconColors.get(facts.id!));
        } else {
          lightSimpleIconColors.set(facts.id!, facts.color);
        }
      }
    }
    await icons.last().scrollIntoViewIfNeeded();
    await expect(icons.last()).toBeVisible();
    await expect(page).toHaveScreenshot(
      `integration-icons-${dark ? "dark" : "light"}.png`,
    );
  }
});
