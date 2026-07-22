# Compact connector icons and replace Canva mark

## Goal

Reduce visual weight in the compact Connectors menu and replace the undersized
Canva gradient wordmark with a clearer square monochrome mark.

## Requirements

- Bundle `https://api.iconify.design/bxl:canva.svg` locally and record its exact
  source, Iconify/Boxicons Brands attribution, license, and SHA-256.
- Treat the new Canva asset as a theme-adaptive monochrome SVG.
- Add an explicit compact size to `IntegrationIcon`: 16x16px in dropdown menu
  rows, while settings and management surfaces remain 20x20px.
- Keep accessible labels, stable layout, local-only asset loading, and all
  existing Pencil/Paper provenance behavior.
- Update unit tests, visual geometry assertions, and affected screenshots.

## Acceptance Criteria

- [ ] The home Connectors dropdown renders all nine marks at 16x16px.
- [ ] Settings and the management dialog continue rendering marks at 20x20px.
- [ ] Canva uses the locally bundled `bxl:canva` SVG and remains visible
  in light and dark themes.
- [ ] Desktop and mobile visual tests pass with refreshed intended baselines.
- [ ] No integration behavior or availability claim changes.

## Out of Scope

- Changing disconnected-row opacity or connector availability.
- Fetching Iconify assets at runtime.
