# Unify Design and Deliver tab UX

## Goal

Make the workspace rail feel like one predictable panel switcher. Clicking
Design or Deliver should first reveal a workspace drawer, matching Agent,
Files, and Git, instead of unexpectedly changing to a dialog or full-page
surface.

## Background

- Agent, Files, Git, and Design already use mutually exclusive left-side
  drawers.
- Deliver currently closes the drawer context and replaces the entire project
  workspace with a separate inline surface.
- The detailed Design system inspector and Deliver workspace remain useful,
  but they should be secondary actions reached from their corresponding
  drawers.
- The existing workspace rail uses one shared `RailItem` treatment; the
  interaction model should now match that visual promise.

## Requirements

- Replace the independent drawer booleans with one explicit active workspace
  panel state so only one rail drawer can be open at a time.
- Keep Agent as the initially active panel and preserve existing automatic
  transitions that reveal Agent or Design content.
- Make Design and Deliver both toggle the same drawer container used by Agent,
  Files, and Git.
- Give Deliver a compact drawer summary based only on existing local workspace
  facts, with a clear command to enter the complete delivery workspace.
- Keep Design's command to enter the complete system inspector.
- Use a shared header treatment for the Design and Deliver drawers, including
  stable title, context subtitle, and close control.
- Preserve the existing detailed Deliver route, return behavior, approvals,
  Design IR authority, and export policy.
- Do not change Agent capabilities, protocols, persistence contracts, or
  generated deliverables.

## Acceptance Criteria

- [ ] Agent, Files, Git, Design, and Deliver are mutually exclusive workspace
  drawers controlled by one active-panel state.
- [ ] Clicking Design or Deliver opens and selects its drawer; clicking the
  active item again closes it.
- [ ] Design and Deliver use the same drawer geometry and header structure.
- [ ] The Deliver drawer reports current approved-result, design-system, and
  prototype-page readiness without inventing completion or approval.
- [ ] The Deliver drawer can open the existing full delivery workspace, which
  retains its explicit return control.
- [ ] Opening Assets closes the active workspace drawer before opening the
  asset library.
- [ ] Existing Agent, Files, Git, Design artifact-opening, and Git review
  behavior remains intact.
- [ ] Focused unit/source tests, type checking, and lint pass.

## Out of Scope

- Redesigning the detailed Design system inspector or delivery workflows.
- Changing approval, export, repository, or Design IR contracts.
- Moving the asset library into the left workspace drawer.
