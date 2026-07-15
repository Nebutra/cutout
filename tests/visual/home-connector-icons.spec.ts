import { expect, test } from "./local-state.fixture";
const simpleIcons = new Set([
  "cutout.figma",
  "cutout.github",
  "cutout.notion",
  "cutout.obsidian",
  "cutout.framer",
]);
test("Home connector popover renders nine stable icons across themes and scroll", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Connectors" }).click();
  const menu = page.getByRole("menu"),
    icons = menu.locator("[data-integration-icon]");
  expect(await icons.count()).toBe(9);
  await expect(
    menu.locator('[data-integration-icon="cutout.canva"].lucide-palette'),
  ).toHaveCount(0);
  for (const dark of [false, true]) {
    await page.evaluate(
      (enabled) => document.documentElement.classList.toggle("dark", enabled),
      dark,
    );
    for (const icon of await icons.all()) {
      const facts = await icon.evaluate((element) => {
        const box = element.getBoundingClientRect(),
          style = getComputedStyle(element),
          svg = element.matches("svg") ? element : element.querySelector("svg");
        return {
          id: element.getAttribute("data-integration-icon"),
          source: element.getAttribute("data-icon-source"),
          width: box.width,
          height: box.height,
          svgWidth: svg?.getBoundingClientRect().width ?? 0,
          svgHeight: svg?.getBoundingClientRect().height ?? 0,
          geometry:
            svg?.querySelectorAll("path,circle,rect,polygon,polyline").length ??
            0,
          path: svg?.querySelector("path")?.getAttribute("d") ?? "",
          gradient: svg?.querySelector("linearGradient")?.id ?? "",
          fill: svg?.querySelector("path")?.getAttribute("fill") ?? "",
          color: style.color,
          background: style.backgroundColor,
          mask: style.maskImage,
        };
      });
      expect(facts.width).toBeCloseTo(16, 0);
      expect(facts.height).toBeCloseTo(16, 0);
      expect(facts.svgWidth).toBeCloseTo(16, 0);
      expect(facts.svgHeight).toBeCloseTo(16, 0);
      expect(facts.mask).toBe("none");
      expect(facts.geometry).toBeGreaterThan(0);
      expect(facts.color).not.toBe("rgba(0, 0, 0, 0)");
      expect(facts.background).toBe("rgba(0, 0, 0, 0)");
      if (simpleIcons.has(facts.id!)) expect(facts.source).toBe("Simple Icons");
      else if (facts.id === "cutout.canva") {
        expect(facts.source).toBe("Canva Developers");
        expect(facts.path.length).toBeGreaterThan(1000);
        expect(facts.gradient).toBe("canva-a");
        expect(facts.fill).toBe("url(#canva-a)");
      } else expect(facts.source).toBe("Cutout generic");
    }
    await icons.last().scrollIntoViewIfNeeded();
    await expect(icons.last()).toBeVisible();
    await expect(menu).toHaveScreenshot(
      `home-connectors-${dark ? "dark" : "light"}.png`,
    );
  }
});
