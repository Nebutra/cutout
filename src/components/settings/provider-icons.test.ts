// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBuiltinProviderRegistry } from "@/services/ai/provider-registry";
import {
  providerOfficialIconAssets,
  providerSimpleIconAssets,
  providerSimpleIconSlugs,
} from "./provider-icon-assets";
import { ProviderIcon } from "./provider-icons";

describe("ProviderIcon", () => {
  it("renders a local inline brand SVG with an accessible wrapper", () => {
    const definition = createBuiltinProviderRegistry().definition("anthropic");
    expect(definition).toBeTruthy();
    const markup = renderToStaticMarkup(
      createElement(ProviderIcon, { definition: definition! }),
    );
    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Anthropic logo"');
    expect(markup).toContain('<svg aria-hidden="true"');
    expect(markup).toContain("<path");
    expect(markup).not.toContain("mask-image");
    expect(markup).not.toContain("https://");
  });
  it("renders the OpenAI identity rather than a generic fallback", () => {
    const definition = createBuiltinProviderRegistry().definition("openai");
    expect(definition?.icon).toMatchObject({
      id: "openai:logo",
      source: "openai",
    });
    expect(providerOfficialIconAssets["openai:logo"]).toMatch(/^<svg/);
    const markup = renderToStaticMarkup(
      createElement(ProviderIcon, { definition: definition! }),
    );
    expect(markup).toContain('aria-label="OpenAI logo"');
    expect(markup).toContain("<title>OpenAI</title>");
    expect(markup).not.toContain("OpenAI provider");
  });
  it("renders the explicitly registered fal.ai identity", () => {
    const definition = createBuiltinProviderRegistry().definition("fal");
    expect(definition?.icon).toMatchObject({ id: "fal:logo", source: "fal" });
    const asset = providerOfficialIconAssets["fal:logo"];
    expect(asset).toMatch(/^<svg/);
    expect(asset).toContain("<title>fal.ai</title>");
    expect(asset).toMatch(/viewBox="0 0 120 48"/);
    expect(asset.match(/<path\b/g)).toHaveLength(4);
    const markup = renderToStaticMarkup(createElement(ProviderIcon, { definition: definition! }));
    expect(markup).toContain('aria-label="fal.ai logo"');
    expect(markup).toContain('data-provider-icon-source="fal:logo"');
    expect(markup).not.toContain("fal.ai provider");
  });
  it("renders a theme-compatible generic SVG without external assets", () => {
    const definition = createBuiltinProviderRegistry().definition("groq");
    expect(definition).toBeTruthy();
    const markup = renderToStaticMarkup(
      createElement(ProviderIcon, {
        definition: definition!,
        className: "size-4",
      }),
    );
    expect(markup).toContain('aria-label="Groq provider"');
    expect(markup).toContain("currentColor");
    expect(markup).not.toContain("<img");
  });
  it("resolves every definition to a non-empty brand asset or a known local renderer", () => {
    const knownLocal = new Set([
      "cutout:provider",
      "cutout:gateway",
      "cutout:compatible",
      "cutout:local",
    ]);
    for (const definition of createBuiltinProviderRegistry().catalog()) {
      const id = definition.icon?.id;
      expect(id, definition.id).toBeTruthy();
      if (id?.startsWith("simple-icons:"))
        expect(
          providerSimpleIconAssets[
            id.slice(13) as keyof typeof providerSimpleIconAssets
          ],
          definition.id,
        ).toMatch(/^<svg/);
      else if (id === "openai:logo" || id === "fal:logo")
        expect(providerOfficialIconAssets[id], definition.id).toMatch(/^<svg/);
      else expect(knownLocal.has(id ?? ""), definition.id).toBe(true);
    }
  });
  it("validates every referenced Simple Icons source as real SVG XML", () => {
    for (const slug of providerSimpleIconSlugs) {
      const xml = readFileSync(
        join(process.cwd(), "node_modules/simple-icons/icons", `${slug}.svg`),
        "utf8",
      );
      expect(xml, slug).toMatch(/^<svg\b/);
      expect(xml, slug).toMatch(/viewBox="0 0 24 24"/);
      expect(xml, slug).toMatch(/<path\s+d="[^"]+"/);
      expect(xml.trim().endsWith("</svg>"), slug).toBe(true);
    }
  });
});
