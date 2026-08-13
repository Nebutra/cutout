# Design OS evidence benchmark

## Goal

Make Cutout's progress measurable as a general Design OS instead of describing
progress through feature count, demos or competition score alone. The benchmark
must show which maturity boundary the product has actually crossed, what remains
blocked, and whether a new build improved or regressed under the same versioned
ruler.

Commerce is the first end-to-end Profile because it stresses structured text,
images, video, strategy, policy and provenance together. The benchmark protocol
must remain Profile-neutral so prototype, brand, launch and temporal Profiles can
join without changing the meaning of existing results.

## Requirements

- Define four ordered evidence stages: `contract`, `conformance`, `real-host`
  and `production-rehearsal`. A later stage cannot compensate for or conceal a
  failed earlier hard gate.
- Derive stage summaries, maturity, coverage, critical frontier and production
  readiness from strict decoded Profile reports. Do not accept caller-authored
  totals, readiness, maturity or score.
- Keep benchmark identity, version, Profile closure and metric closure exact.
  Changing a metric's semantics, weight, stage or criticality requires a new
  benchmark version; reports from incompatible rulers cannot be compared.
- Separate `passed`, `failed` and `blocked`. Blocked means required trustworthy
  evidence or capability does not exist; it is never silently counted as a
  failure or partial pass.
- Record source report identity and content hash so every projected metric can
  be traced back to its owning Profile evidence. An adapter may project only a
  report that its Profile decoder has already validated.
- Comparison must report newly passed metrics, regressions, stage transitions,
  maturity movement and coverage deltas. Any critical passed-to-non-passed
  transition is a release regression regardless of the aggregate coverage.
- Publish a durable current Design OS snapshot and a deterministic command that
  validates and renders it for humans and CI.
- Project the Commerce benchmark as the first Profile. Its five deterministic
  metrics form the contract stage, three mocked-Host metrics form conformance,
  eight real-Host metrics form real-host, and an explicit rehearsal gate remains
  blocked until one complete unseen-input production run is independently
  verifiable.
- Preserve the truthful current baseline: Commerce contract `5/5`, conformance
  `3/3`, real Host `0/8`, production rehearsal `0/1`; maturity is
  `conformance`, coverage is `8/17`, and production readiness is false.
- A real Commerce pass requires exact 11-artifact role closure, signed receipt
  and byte binding, internally derived Commerce evaluation, semantic media QA,
  playable video proof and a durable re-verifiable bundle. Until this exists,
  no trusted helper may mint or decode real-host passes.

## Acceptance Criteria

- [x] B1: A strict `design-os.benchmark-report.v1` decoder rejects reordered,
      missing, duplicated, metadata-drifted or caller-resummarized metrics.
- [x] B2: The current Commerce projection deterministically reports contract
      `5/5`, conformance `3/3`, real-host `0/8`, rehearsal `0/1`, maturity
      `conformance`, coverage `8/17` and `productionReady=false`.
- [x] B3: Comparisons under one benchmark identity/version expose new passes,
      all regressions, maturity and stage changes; incompatible rulers fail.
- [x] B4: Critical hard-gate regression blocks release even when aggregate
      coverage rises, and later-stage evidence cannot skip an earlier stage.
- [x] B5: `pnpm benchmark:design-os` validates the durable current snapshot and
      prints its stage counts, maturity, frontier and readiness without network
      or model access.
- [x] B6: Commerce real-host passes continue to fail closed until the complete
      trusted verification bundle is implemented; a caller boolean, one receipt
      reused across roles, or container-only video cannot advance the benchmark.
- [x] B7: Focused tests, type-check, lint, `pnpm agent:validate` and
      `rtk git diff --check` pass for the changed surface.

## Out Of Scope

- A public leaderboard, benchmark UI, model-provider ranking or competition
  score prediction.
- Pretending one subjective model score is ground truth. Probabilistic visual
  quality distributions and judge calibration are a follow-up Profile evaluator.
- Running paid Provider calls in deterministic CI.
- Claiming Commerce production readiness before the trusted rehearsal boundary
  and its missing semantic/video verification capabilities are implemented.
