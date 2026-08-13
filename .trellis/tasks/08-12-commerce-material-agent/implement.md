# Design OS commerce program - integration plan

## Program Role

This parent owns shared product invariants, task boundaries, dependency order and
cross-child acceptance. Implementation happens in the six child tasks; the
parent is not a seventh mega-implementation target.

## Stage 0: Baseline And Contracts

- [ ] Freeze the competition evaluator, legal sample subset, held-out fixtures,
      prototype regression corpus and canonical cross-host fixture.
- [ ] Review and freeze the Kernel interfaces required by Commerce and Host work.
- [ ] Start `08-12-design-os-kernel`; keep the legacy prototype path available
      until its compatibility gate passes.

Exit: Kernel K1-K9 and prototype regressions pass; shared schemas have one source.

## Stage 1: Competition-Critical Parallel Work

- [ ] Start `08-12-commerce-production-profile` against frozen Kernel interfaces.
- [ ] Start Temporal `Gate A` only: exact text/image/Wan-video Host operations,
      retry/poll/download receipts and physical media validation.
- [ ] Keep Project Change Management, Timeline Gate B and Desktop UI off the
      benchmark critical path.

Exit: Profile P1-P7 and Host TA1-TA3 pass with mocked plus reviewed evidence.

## Stage 2: Competition Host

- [ ] Start `08-12-qianwen-competition-host` only after Stage 1 interfaces pass.
- [ ] Run package/container/path/network/failure/public/held-out validation.
- [ ] Run a real unseen-data rehearsal, record sanitized evidence and submit
      early enough to use score feedback through the Promotion Gate.

Exit: Competition B1-B7 and parent A6-A9 pass. Removing the Host leaves current
Desktop, CLI, MCP and capability declarations unchanged.

## Stage 3: Project Management Foundation

- [ ] Start `08-12-design-os-project-changes` on the stable Kernel.
- [ ] Route new operations through semantic commands/ChangeSets before wrapping
      existing direct mutations; keep compatibility adapters until parity passes.
- [ ] Evolve existing Global Library/CAS and repository bindings, never replace them.

Exit: Project Changes C1-C10 and parent A3-A5 pass locally without claiming cloud collaboration.

## Stage 4: Temporal Product And Desktop Workbench

- [ ] Complete Temporal `Gate B`: Media Timeline, non-destructive edits,
      timecode QA, cross-profile fixtures and optional proven H3/Seedance routes.
- [ ] Start `08-12-design-os-desktop-workbench` after Kernel/Project projections
      stabilize; migrate prototype, commerce and Timeline renderers incrementally.
- [ ] Keep one Brief/Sources/Board/Review/Deliver shell and truthful Host-derived capabilities.

Exit: Temporal TB1-TB5, Workbench W1-W8 and parent A1-A5/A10 pass.

## Final Integration Gate

- [ ] Trace every parent criterion A1-A13 to child fixture, package run or real evidence.
- [ ] Verify no duplicated Kernel/Profile contracts or host-private lifecycle state.
- [ ] Verify every benchmark change has ownership and promotion evidence.
- [ ] Run affected schema, prototype, Design IR, approval, Library, Provider,
      commerce, Timeline, UI and package suites; lint, type-check, build and Rust
      checks as touched.
- [ ] Read `cutout.agent-capabilities.json` before any public Agent-surface change,
      keep CLI/MCP/protocol/manifest/docs/plugin synchronized and run
      `pnpm agent:validate`.
- [ ] Run `rtk git diff --check` and preserve all unrelated user changes.

## Rollback Points

- Kernel compatibility adapter before generic runtime becomes prototype default.
- Commerce facts/policies before any Provider execution.
- Mocked multimodal Host before real Provider routes.
- Competition Host before any public Agent capability exposure.
- Semantic-command adapters before removal of existing workspace mutation paths.
- General workbench controller before retiring the prototype-shaped UI.
