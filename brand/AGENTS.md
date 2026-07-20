# Cutout Brand Consumer Contract

These instructions apply to every AI or human changing Cutout brand surfaces.

1. `canonical/` is the only authoritative identity source in this repository.
2. Use symbol 13 and wordmark 15 exactly as supplied. Never redraw, trace,
   prompt-generate, simplify, round, crop, or reconstruct their geometry.
3. Use `derivatives/*-current-color.svg` only for host-controlled monochrome UI
   slots. Do not edit their paths; they differ from canonical files only by the
   declared `currentColor` fill.
4. Use `CutoutBrandMark` in React. Do not inline SVG paths or substitute a
   Lucide icon, letter, emoji, scissors, crop frame, sparkle, or lightning bolt.
5. Use the symbol from 16-95 px, stacked lockup from 96-159 px, and horizontal
   lockup from 160 px upward unless a documented surface constraint requires a
   different approved lockup.
6. Brand marks are not generic project thumbnails, tool icons, or workflow
   status icons. Use a semantic UI icon for those jobs.
7. Model-generated imagery may supply a scene or material only. Overlay
   canonical identity deterministically after generation.
8. Do not add a rounded container, exterior frame stroke, gradient, shadow,
   bevel, or decorative color to the mark. Platform icons must remain
   borderless and preserve clear space on the approved paper surface.
9. Run `pnpm brand:sync` after an approved canonical update and
   `pnpm brand:check` before delivery. A canonical checksum change invalidates
   all descendants until the manifest is deliberately updated.
10. Legal/trademark clearance is not represented as complete. See
    `LICENSES.md` before external commercial rollout.
