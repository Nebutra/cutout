# Design

## Boundary

This is a responsive layout-token adjustment inside existing Tauri and React/Tailwind surfaces. No component ownership or data-flow boundary changes.

## Approach

1. Raise only the Tauri window's initial dimensions; retain the current minimum dimensions for compatibility.
2. Expand Home's outer and primary content measures at large breakpoints, strengthen its top-level type and spacing, and allow four project columns only where the viewport can support them.
3. Expand workspace drawers and inspectors at `2xl`-class widths while retaining their current smaller desktop dimensions below that threshold.
4. Add focused render assertions for the class-level layout contract and verify responsive behavior visually.

## Trade-offs

- Fixed large defaults improve first impression but do not force maximization or fullscreen.
- Breakpoint-scoped panel growth avoids stealing canvas space on smaller machines.
- Existing compact metadata remains compact; hierarchy improves through selective sizing rather than blanket scaling.

## Compatibility And Rollback

- Tauri minimum size is unchanged.
- Responsive classes preserve the existing mobile and compact desktop branches.
- Rollback is limited to the changed dimension and Tailwind class values.
