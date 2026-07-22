# Unify Design and Deliver sidebar navigation

## Goal

Make the workspace rail read and behave as one coherent navigation system, so
Design and Deliver no longer feel like separately implemented controls.

## Background

- Every visible rail entry is rendered with the shared `RailItem` component.
- Agent, Files, and Git toggle mutually exclusive workspace drawers.
- Design still receives the drawer's active state, but its click handler closes
  that drawer and opens a different inspector surface, so it can never appear
  selected.
- Deliver is intentionally a full-width workspace mode with existing routing and
  visual-regression coverage; this task must preserve that information
  architecture.

## Requirements

- Use one stable geometry, label treatment, hover state, focus state, and active
  state for every workspace rail entry.
- Make Design toggle the existing Design drawer with the same mutual-exclusion
  behavior as Agent, Files, and Git.
- When opening Assets or Deliver, close any open workspace drawer first so rail
  actions do not leave contradictory active state behind.
- Preserve Deliver's full-width inline workspace, return behavior, and existing
  Agent / Canvas / Deliver navigation contract.
- Do not change Agent capabilities, protocols, approvals, exports, or persisted
  Design IR data.

## Acceptance Criteria

- [ ] Agent, Files, Git, Assets, Design, and Deliver use identical rail-item
  dimensions and interaction styling.
- [ ] Clicking Design opens and selects the Design drawer; clicking it again
  closes the drawer.
- [ ] Selecting Agent, Files, Git, or Design closes the previously open drawer.
- [ ] Opening Assets or Deliver clears drawer selection before opening the
  requested surface.
- [ ] Deliver still renders as the existing inline main workspace and retains
  its explicit return control.
- [ ] Focus-visible styling and accessible button names remain present.
- [ ] Focused unit/source-contract tests and the relevant visual navigation test
  pass.

## Out of Scope

- Replacing the existing Agent / Canvas / Deliver information architecture.
- Moving Deliver into the narrow drawer.
- Changing the Design or Deliver content workspaces.
