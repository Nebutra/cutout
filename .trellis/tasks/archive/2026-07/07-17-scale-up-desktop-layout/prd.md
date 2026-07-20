# Scale up desktop layout

## Goal

Make Cutout feel more spacious and visually confident on contemporary desktop displays without changing its workflows, information architecture, or compact-window usability.

## Background

- The Tauri window currently opens at `1280x860` with a `1040x720` minimum in `src-tauri/tauri.conf.json`.
- The Home content is capped at `max-w-5xl` and its primary composer at `max-w-3xl` in `src/components/home/ProjectHome.tsx`.
- The project workspace uses a `24rem` drawer and an `18.5rem` wide-screen inspector in `src/components/workspace/IntentWorkspace.tsx`.
- Existing uncommitted changes overlap these files. This task must preserve those changes and remain limited to layout-related values and assertions.

## Requirements

- R1. Increase the default desktop window size to better use modern laptop and desktop displays while retaining the existing minimum size.
- R2. Increase Home's content and composer width, vertical breathing room, heading scale, and project-grid capacity at large viewports.
- R3. Give the project workspace's content-bearing side panels more room at wide desktop sizes without reducing canvas usability at the minimum supported width.
- R4. Improve the most prominent undersized workspace labels where they affect hierarchy; do not mechanically enlarge every metadata label.
- R5. Preserve all existing actions, responsive breakpoints, localization behavior, accessibility labels, and business logic.
- R6. Keep the change frontend/layout-only. Do not alter Agent contracts, `.cutout` IR, export behavior, branding, or service behavior.

## Acceptance Criteria

- [x] AC1: A new desktop window opens at `1440x960`; the minimum remains `1040x720`.
- [x] AC2: At `1440px` and wider, Home uses a content measure around `1152px`, a primary composer measure around `896px`, and a four-column project grid when space permits.
- [x] AC3: Home remains single-column and overflow-free on narrow viewports, with existing mobile navigation behavior intact.
- [x] AC4: At wide desktop sizes, the workspace drawer and inspector gain usable width while the main canvas remains a bounded flexible track.
- [x] AC5: Existing component tests pass, new assertions cover the revised layout contract, and the frontend production bundle succeeds.
- [x] AC6: Visual inspection at desktop and the minimum supported viewport shows no overlap, clipping, blank canvas, or incoherent text wrapping.

Playwright visual checks cover the `1440px` desktop layout, the exact `1040x720` minimum desktop window, and the narrower mobile branch. The Home composer geometry assertions verify that controls remain inside the surface without overlap, while the workspace checks verify bounded panels, a visible canvas, and no global horizontal overflow.

## Out Of Scope

- Brand palette, typography family, icons, or visual identity changes.
- New navigation, panels, settings, or workflows.
- Global browser zoom or blanket root font-size scaling.
- Agent capability, CLI, MCP, protocol, manifest, or documentation changes.
