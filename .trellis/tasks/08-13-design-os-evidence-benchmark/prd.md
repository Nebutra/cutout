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

- Define three ordered evidence stages: `contract`, `real-host` and
  `production-rehearsal`. A later stage cannot compensate for or conceal a
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
  metrics form the contract stage, eight real-Host metrics form real-host, and
  an explicit rehearsal gate remains
  blocked until one complete unseen-input production run is independently
  verifiable.
- Exclude simulated Host evidence from metric definitions, persisted
  reports, snapshots, coverage, maturity, frontier and user-facing output.
  Deterministic fixtures may test behavior but never contribute a pass.
- Preserve the truthful current baseline: Commerce contract `5/5`, real Host
  `0/8`, production rehearsal `0/1`; maturity is `contract`, coverage is
  `5/14`, and production readiness is false.
- A real Commerce pass requires exact 11-artifact role closure, signed receipt
  and byte binding, internally derived Commerce evaluation, semantic media QA,
  playable video proof and a durable re-verifiable bundle. Outside the
  dedicated path that re-verifies that complete bundle, no helper may mint or
  decode real-host passes.
- A complete signed bundle does not by itself prove the production-rehearsal
  input was unseen. The final gate stays blocked until held-out input selection
  is independently bound and re-verifiable.
- Provide one real desktop production runner that preflights all deterministic
  source, Provider, route, catalog and graph failures before the single-use
  commitment, executes the exact Commerce DAG with native receipts, and returns
  only a pending independent-evaluator completion request.
- A successfully settled held-out native call must survive renderer/IPC response
  loss without a second paid call. Exact retry recovers the original signed
  response; request drift, stored-response tampering and cross-process slot races
  fail closed.
- Cancellation must reach source ingestion as well as Provider operations. The
  native cancellation UUID stays separate from the deterministic signed receipt
  request identity and an aborted source transfer cannot settle a ledger slot.
- Provide a real desktop operator surface for importing an evaluator-owned input
  package, selecting an eligible Keychain-backed Provider, starting or replay-
  recovering the Run, exporting pending evidence, importing completion and
  invoking native admission. A library export with no caller is insufficient.
- Provide an evaluator-only CLI that converts the three raw competition JSON
  inputs through real bounded Commerce ingestion, derives the exact input
  manifest, delegates signatures to an external Minisign process without
  reading the private key, materializes the exact receipt-bound source,
  deliverable, semantic-QA and playback bytes for human inspection, requires
  explicit review of the eleven-deliverable closure before completion, and
  emits only strictly decoded handoff files.

## Acceptance Criteria

- [x] B1: A strict `design-os.benchmark-report.v1` decoder rejects reordered,
      missing, duplicated, metadata-drifted or caller-resummarized metrics.
- [x] B2: The current Commerce projection deterministically reports contract
      `5/5`, real-host `0/8`, rehearsal `0/1`, maturity `contract`, coverage
      `5/14` and `productionReady=false`, with no simulated Host scoring surface.
- [x] B3: Comparisons under one benchmark identity/version expose new passes,
      all regressions, maturity and stage changes; incompatible rulers fail.
- [x] B4: Critical hard-gate regression blocks release even when aggregate
      coverage rises, and later-stage evidence cannot skip an earlier stage.
- [x] B5: `pnpm benchmark:design-os` validates the durable current snapshot and
      prints its stage counts, maturity, frontier and readiness without network
      or model access.
- [x] B6: Commerce real-host passes fail closed unless the complete signed
      verification bundle is supplied and reverified; a caller boolean, one
      receipt reused across roles, or container-only video cannot advance the
      benchmark.
- [x] B7: Focused tests, type-check, lint, `pnpm agent:validate` and
      `rtk git diff --check` pass for the changed surface.
- [x] B8: Before commitment issuance, Rust verifies an evaluator-signed
      challenge-selection payload against the build-pinned trust root. The
      payload binds protocol/version, Commerce benchmark/Profile identity,
      challenge id and nonce, exact selected-input manifest hash, the only
      allowed Run id, evaluator key id, and a bounded issue/expiry window.
- [x] B9: The native commitment hash is signed into every source-ingest,
      Provider, semantic-QA and playback-promotion receipt admitted for the
      held-out Run. Timestamp ordering is defense in depth; a timestamp-only
      or partially bound bundle cannot pass, including after local clock
      rollback.
- [x] B10: Bundle-only fixture verification retains the truthful `5/14`,
      real-Host `0/8`, rehearsal `0/1` snapshot. The normal decoder rejects a
      caller-authored rehearsal pass and Run 6 remains inadmissible.
- [x] B11: Rust re-verifies both evaluator signatures at final admission. The
      completion attestation binds the exact pre-run challenge hash,
      commitment, input, Run, final bundle hash and completion metadata;
      challenge expiry, missing receipt bindings, or any challenge/key/Run/
      input/bundle drift fails closed.
- [x] B12: One evaluator challenge registers exactly one native commitment.
      Every held-out source, Provider, semantic-QA and playback execution slot
      settles at most one successful signed receipt, and final admission
      requires the exact durable native replay-ledger closure before sealing
      that commitment to one bundle and completion attestation.
- [x] B13: Every held-out source/Provider/playback success persists one
      host-HMAC-signed serialized replay response before Keychain slot
      registration. Exact retry returns the original receipt and bytes;
      request drift, SQLite tampering and concurrent alternate settlement are
      rejected.
- [x] B14: The production runner preflights identity-anchor-first sources,
      canonical fixed-origin URLs, enabled keyed first-party DashScope authority,
      catalogs/graphs and all four exact executable routes before commitment;
      it then binds the frozen main/detail/video DAG and returns pending admission.
- [x] B15: Runner closure is exactly eleven Provider receipts, seven semantic-QA
      receipts and one playback-promotion receipt plus selected source receipts.
      Pure contract tests use no Provider/native mock and contribute zero score.
- [x] B16: Source ingest uses native cancellation with a distinct opaque UUID;
      aborting before settlement leaves no successful held-out slot and every
      focused/native/static gate remains green.
- [x] B17: The desktop Commerce production panel is a real lazy-loaded runner
      caller. It imports strict evaluator/pending/completion files, exposes only
      eligible keyed first-party DashScope Providers, propagates cancellation,
      supports replay recovery and calls native admission before showing 14/14.
- [x] B18: `pnpm commerce:evaluator` supports raw-input preparation, key-info,
      challenge, byte-exact inspection, review and completion handoffs.
      Preparation uses the real bounded Commerce ingester and identity anchor,
      challenge revalidates that source selection before signing, inspection
      writes fixed filenames only into a new private directory and checks every
      source/Provider/QA payload against its receipt, the evaluator secret stays
      outside Cutout, every signature is immediately verified, completion
      requires a drift-free explicit eleven-deliverable review, and these tools
      contribute zero score.
- [x] B19: Challenge-selection v2 cryptographically binds the authoritative
      Cutout Host build version. The evaluator rejects package/Cargo version
      drift; Rust checks the signed value against `env!("CARGO_PKG_VERSION")`
      before commitment and again at final admission; commitment, completion,
      admission and Design OS evidence expose the same version. Legacy v1,
      missing or drifted versions fail closed and change no benchmark score.

## Out Of Scope

- A public leaderboard, benchmark UI, model-provider ranking or competition
  score prediction.
- Pretending one subjective model score is ground truth. Probabilistic visual
  quality distributions and judge calibration are a follow-up Profile evaluator.
- Running paid Provider calls in deterministic CI.
- Claiming Commerce production readiness before a fresh evaluator-signed unseen
  challenge, real Provider run, evaluator completion and native admission exist.
