# Integration Brand Icons

## Scope

Apply this contract when adding or changing a third-party product mark rendered
by `IntegrationIcon` in settings or connector menus.

## Asset Contract

- Bundle trusted assets locally; do not fetch brand artwork at runtime.
- Record the exact upstream asset URL, trademark/license terms, and SHA-256 in
  `src/components/integrations/BRAND_ASSETS.md` for downloaded files.
- Keep `integrationIconRegistry` as the single source of asset kind and
  provenance for every integration surface.
- Use a labeled generic Lucide icon only when no trusted bundled mark exists.
  Never present a generic fallback as an official product logo.

## Theme Contract

- `monochrome-svg`: render geometry with the current theme foreground.
- `color-svg` and `image`: preserve official artwork; do not apply a global
  fill, grayscale, or theme-color rewrite inside `IntegrationIcon`.
- Keep the icon box stable at 20x20px so geometry and image loading cannot
  shift list layout.

## Accessibility

- Official assets expose `<Product> logo` on the outer `role="img"` element.
- Inner SVGs and images are hidden from assistive technology to avoid duplicate
  announcements.
- Generic assets expose `<Product> integration`, making fallback status clear.

## Required Tests

- Unit: every connector resolves through the shared registry/component;
  official assets expose provenance; only intended fallbacks are generic.
- Visual: light and dark themes verify 20x20 geometry or loaded image pixels,
  non-transparent foreground, scrolling, and desktop/mobile screenshots.
- Preserve product-specific behavior such as Canva's official gradient rather
  than applying monochrome rules indiscriminately.

## Wrong Vs Correct

Wrong: inject a black SVG unchanged, load a remote logo URL, or use a generic
icon while labeling it as the product logo.

Correct: bundle a documented asset, classify it in the registry, render it
through `IntegrationIcon`, and prove light/dark visibility in visual tests.
