# Swap Git icon to collapse control on hover

## Goal

Remove the duplicated Git/collapse icon treatment in the Git dock header by
using one stable icon button that reveals the collapse action on interaction.

## Background

- The Git header currently renders a static `GitBranch` mark on the left and a
  separate `PanelLeftClose` button on the right.
- The two related icons make the header read as visually duplicated and detach
  the drawer action from the Git identity.

## Requirements

- Replace the static left Git mark with one fixed-size button.
- Show the Git mark by default and cross-fade/swap to the collapse-drawer icon
  on pointer hover and keyboard focus.
- Clicking the button invokes the existing `onClose` callback.
- Remove the separate right-side `Hide Git` button.
- Preserve the Git title, branch/status text, push and refresh controls, header
  dimensions, and dock behavior.
- Keep an accessible `Hide Git` name, focus indication, and hover title/tooltip.
- Respect reduced motion by avoiding required movement; a short opacity swap is
  sufficient and the action must remain understandable without animation.

## Acceptance Criteria

- [ ] The header contains exactly one `Hide Git` control.
- [ ] Its stable icon box contains both Git and collapse glyphs, with Git visible
      by default and collapse visible for hover/focus styling.
- [ ] Activating the control calls `onClose` once.
- [ ] Refresh, push, tabs, and repository behavior remain unchanged.
- [ ] Focused unit tests, lint, TypeScript, and relevant visual checks pass.

## Out Of Scope

- Changing the collapsed global sidebar affordance.
- Redesigning Git tabs, repository authorization, or Git operations.
