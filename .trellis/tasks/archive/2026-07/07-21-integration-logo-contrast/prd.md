# Fix integration logo contrast and official Pencil Paper marks

## Goal

Make the integration list logos immediately recognizable and readable in both
light and dark themes, including official marks for Pencil and Paper.

## Background

- Bundled Simple Icons SVGs currently retain black fills, so several marks lose
  contrast on the dark settings surface.
- Integration icons render at 16px in a comparatively tall list row.
- Pencil and Paper currently use generic Lucide icons instead of product marks.
- Pencil's current official site is `pen.dev`; Paper's official site identifies
  its 512px app icon as the organization/application logo.

## Requirements

- Theme-adapt monochrome bundled brand SVGs without changing the Canva brand
  gradient or the official Pencil/Paper artwork.
- Render integration marks at a stable 20px size across integration surfaces.
- Bundle the official Pencil and Paper app marks locally with source and
  trademark provenance; do not load remote assets at runtime.
- Keep Repository on a labeled generic icon and preserve accessible names for
  every connector.
- Update unit and visual assertions that distinguish official assets from
  controlled fallbacks.

## Acceptance Criteria

- [x] Figma, GitHub, Notion, Obsidian, and Framer remain visible in light and
  dark themes.
- [x] Pencil and Paper render official locally bundled artwork and report the
  official site as their source.
- [x] All nine integration icons have non-empty geometry/pixels at 20x20px in
  settings and the home connector menu.
- [x] Canva retains its official gradient wordmark behavior.
- [x] Repository remains the only generic integration mark.
- [x] Focused unit and Playwright visual tests pass.

## Out of Scope

- Changing integration availability, connection behavior, or host claims.
- Adding live remote logo fetching.
