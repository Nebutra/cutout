# General Design OS desktop workbench - implementation plan

## Order

- [ ] Extract domain-neutral workbench controller and projection interfaces.
- [ ] Add artifact renderer/inspector/action registries and adapt prototypes.
- [ ] Stabilize Brief/Sources/Board/Review/Deliver navigation and Outcome context.
- [ ] Add ChangeSet, Review, ActionQueue, history and approval lens projections.
- [ ] Add commerce text/image/document renderers and explicit desktop execution.
- [ ] Add semantic media Timeline and timecode review over accepted Host routes.
- [ ] Add mixed-Outcome journeys, responsive/localized visual QA and accessibility.
- [ ] Add virtualized incremental large-Project projections, lazy artifact decode
      and checked reference-hardware performance/memory baselines.
- [ ] Synchronize only implemented public Agent/CLI/MCP/docs/plugin capabilities.

## Validation

- [ ] Run controller/renderer/command/lens parity, profile-isolation and scale tests.
- [ ] Run prototype, commerce and mixed-Outcome E2E plus desktop/mobile screenshots.
- [ ] Run accessibility, localization, type-check, lint, production build,
      `pnpm agent:validate` where surfaces change and `rtk git diff --check`.

## Dependency And Rollback

Depends on Kernel and Project Change Management; commerce and temporal renderers
depend on their child contracts and proven Host routes. Migrate incrementally
behind adapters, preserving the current workspace until W1-W9 pass.
