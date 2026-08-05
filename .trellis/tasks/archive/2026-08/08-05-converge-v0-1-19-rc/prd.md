# Converge v0.1.19 release candidate with real-model E2E evidence

## Problem

The working tree holds 118 uncommitted paths that are **complete work, not
work-in-progress** — every automated gate passes on the dirty tree (tsc, oxlint,
`cargo check`, 2038 vitest tests, 129 Playwright visual tests, `agent:validate`).
Nothing is committed, so none of it is releasable and an interrupted session
would lose it.

At the same time the product's defining end-to-end proof has **never been
executed**. Seven suites — including
`src/components/workspace/prototype-pipeline.e2e.test.tsx:161`, self-described as
"the definitive *can the Agent deliver what the user wants* proof" — are gated
behind env flags because they cost real money and minutes. CI has therefore
never run them once.

Separately, the Trellis backlog is 80% noise: 27 of 34 active tasks are already
shipped, verified against CHANGELOG entries and commit hashes.

## Goal

Produce a committed, evidence-backed **v0.1.19 release candidate** whose
real-model end-to-end behaviour has actually been measured, so a product review
can decide *whether to ship* rather than *whether it is shippable*.

## Constraints

- **Do not publish.** No tag push, no `gh release create`, no
  `gh release edit --draft=false`. Publishing is irreversible and outward-facing;
  it stays a human decision.
- **Do not work on `main` directly.** Branch first.
- Do not change the hardcoded relay IP in `src-tauri/src/commands/ai/ai_proxy.rs:325-337`
  or the fixed provider endpoints in `provider_discovery.rs:1229-1252`. These are
  deliberate (`.trellis/spec/frontend/byok-provider-protocols.md:296-308`) and
  altering them changes product network behaviour. Surface for human decision only.
- A failing real-model proof is a **finding to report**, not a blocker to patch
  over. Record the truth.

## Acceptance criteria

- [ ] All four in-flight threads committed as separate reviewable commits on a branch
- [ ] Thread C (money/budget removal from the paid-tool authority model) has a PRD
      recording its acceptance criteria — it changed authorization semantics with none
- [ ] Trellis backlog reduced to only genuinely-open tasks; 4 duplicate directories
      that exist in both `tasks/` and `tasks/archive/` deleted; untracked task dirs committed
- [ ] Two persisted-schema migrations have read-path compatibility
      (`visual-generation/contracts.ts:108`, `services/ai/planning-runtime.ts:52-57`)
- [ ] Real-model E2E suites executed, with outcome, cost and wall-clock recorded to
      `docs/experiments/`
- [ ] Packaged-desktop E2E attempted with `CUTOUT_PACKAGED_E2E=1`; result recorded
- [ ] Every pre-existing gate still green after all changes
- [ ] One-page review brief written
- [ ] Nothing published

## Out of scope

- Publishing the release
- Competitive-matrix P0 feature work (15 items are pure-code reachable but are
  multi-day, not overnight)
- Resolving the two reserved human decisions (hardcoded relay IP; the burned
  `v0.1.16` tag)
