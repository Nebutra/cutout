# Design OS Evidence Benchmark

> Versioned, Profile-neutral progress measurement for trustworthy design
> production maturity.

## Scenario: Measure Design OS Progress

### 1. Scope / Trigger

Use this contract when projecting a Profile evaluation into product maturity,
persisting a benchmark snapshot, comparing builds or deciding whether a change
is a release regression. A benchmark describes proven capability; it never
grants Host authority or makes a Provider operation available.

### 2. Signatures

```ts
createDesignOsBenchmarkFromCommerce({ commerceReport, identity }): Promise<DesignOsBenchmarkReport>
createDesignOsBenchmarkFromCommerceHeldOutRehearsal({
  baselineCommerceReport,
  rehearsalBundle,
  commitment,
  evaluatorAttestation,
  identity,
}): Promise<DesignOsBenchmarkReport>
decodeDesignOsBenchmarkReport(input): DesignOsBenchmarkReport
compareDesignOsBenchmarkReports(prior, current): DesignOsBenchmarkComparison
publicBenchmarkPasses(summary): boolean // outer competition evaluator only
```

`pnpm benchmark:design-os` strictly decodes the durable snapshot, regenerates it
from its durable Profile source, compares canonical content and renders the
human-readable maturity frontier. `pnpm benchmark:design-os:update` is the only
supported current-snapshot writer.

### 3. Contracts

- `ruler.json` is the versioned ordered closure of stages, Profiles and metrics.
  Changing a label, stage, criticality, source metric, audit finding, metric or
  Profile requires a new ruler version. Each metric has exactly one Profile
  metric or capability-audit source. Incompatible rulers cannot be compared.
- Maturity stages are ordered and contiguous: `contract -> real-host ->
  production-rehearsal`. A later stage cannot skip or compensate
  for a non-ready earlier stage.
- `passed`, `failed` and `blocked` remain distinct. Blocked means required
  trustworthy evidence or capability is unavailable. It is not partial credit.
- Coverage is descriptive only. Production readiness requires every stage and
  metric to pass. Any critical `passed -> failed|blocked` transition is a release
  regression even if total coverage rises.
- A Profile adapter first invokes the Profile's strict report decoder, then maps
  fixed source metrics and hashes the normalized complete source report. The
  benchmark core never reimplements domain evaluation or infers status from
  Provider/model identity.
- `decodeDesignOsBenchmarkReport` verifies strict persisted shape, exact ruler
  metadata and sources, ordered closure and derived summaries. It does not prove
  that a standalone report's caller-authored metric statuses match external
  evidence. Trustworthy publication must regenerate through the owning Profile
  adapter or use the offline command to compare the snapshot with its source.
- Comparisons derive metric transitions, stage readiness transitions, newly
  passed metrics, all regressions, critical regressions, coverage delta and
  maturity movement. Stored comparison summaries are never accepted as input.
- Commerce v2 contributes five Contract metrics, eight Real-Host metrics and one
  explicit Production-Rehearsal audit gate. Simulated Host execution is excluded
  from definitions, reports, snapshots, coverage, maturity and user-facing output.
  The current re-verifiable snapshot is Contract `5/5`, Real Host `8/8`,
  Rehearsal `1/1`, maturity `production-rehearsal`, coverage `14/14` (`100%`).
  This is internal product evidence, not an official competition hidden-set
  score or leaderboard claim.
- Commerce real-host passage requires the exact eleven-artifact role closure,
  signed receipt/byte/role/node/lock/Plan bindings, internal Commerce evaluation,
  semantic media QA, playable video and a durable re-verifiable bundle. Native
  receipt authenticity alone cannot pass a Commerce benchmark metric.
- That bundle advances the real-host stage only. The production-rehearsal gate
  additionally requires independently re-verifiable evidence that the input
  was held out from development and prior rehearsals; a caller-authored label or
  bundle identity cannot establish that fact.
- Production-rehearsal admission uses a dedicated decoder, not a mode flag on
  the normal report decoder. It requires a native Keychain-HMAC pre-run
  commitment over the exact v2 challenge, configured evaluator key id,
  authoritative Host build version, selected input manifest, Run and timestamp,
  then Rust Minisign-verifies an independent evaluator attestation over that
  same build version, commitment and completed Commerce bundle hash. Final
  admission and capability-audit evidence expose the exact compiled version;
  legacy v1, missing or drifted versions are rejected.
  The normal decoder rejects a passing audit metric, and fixture/mocked native
  verifiers contribute no benchmark evidence.
- Native replay state makes the evaluator challenge single-use: exact retries
  within its validity window recover one registered commitment, each held-out
  execution slot can settle only one successful signed receipt, and admission seals the exact receipt
  ledger to one bundle and evaluator completion. Run-id binding by itself is
  not sufficient single-attempt authority.
- Commerce now has an executable desktop production runner and real verified
  structured-text, reference-conditioned image, vision-JSON and image-to-video
  routes. Route probes and a pending runner bundle are capability evidence, not
  benchmark evidence. They change no metric until the independent evaluator
  completion is native-admitted against the exact bundle and replay ledger.
- Durable replay responses prevent a lost renderer reply from forcing another
  duplicate Provider attempt: the signed response is persisted before the Keychain slot, and
  exact retry recovers the original bytes. This strengthens run integrity but
  does not itself pass a metric.
- A callable runner without an operator is not production evidence. The desktop
  Commerce surface must import a strictly decoded evaluator-owned package,
  execute or replay-recover the exact Run, export pending evidence, import the
  evaluator completion and invoke native admission. External evaluator tooling
  and UI availability remain capability surfaces and change no metric by
  themselves.
- The outer Qianwen public-sample evaluator has an independent regression gate.
  PASS requires Top-1, Recall@5 and Recall@30 to equal the complete reviewed
  product count, MRR to equal `1.0`, every counterfactual retrieval to remain
  Top-1, deterministic measurement and translation-request closures to be
  complete, and every visual role to retain its required source assignment.
  The report declares `offline-public-sample` scope. It measures request and
  orchestration contracts, not translation semantics, generated-media quality,
  a hidden set, a leaderboard result or SOTA; it never changes Design OS
  maturity or `productionReady`.

### 4. Validation And Error Matrix

| Condition | Required behavior |
| --- | --- |
| Missing, duplicate or reordered metric/Profile | reject exact closure |
| Metric label, stage, source mapping, audit finding or criticality differs | reject metadata drift |
| Summary, readiness, maturity or frontier differs from statuses | reject caller-authored derivation |
| Later stage passes while an earlier stage fails | retain maturity before the failed stage |
| Critical passed metric becomes failed or blocked | set `releaseRegression=true` |
| Snapshot differs from regenerated Profile projection | offline command fails as stale |
| Profile source cannot strictly decode | do not publish a Design OS report |
| Commerce has receipts but lacks eleven-role/evaluation/QA closure | keep real-host and rehearsal blocked |
| Complete signed Commerce bundle lacks independent held-out-input evidence | pass eligible real-host metrics but keep rehearsal blocked |
| Runner returns a pending completion request or a live route probe succeeds | change no metric; retain the prior durable snapshot |
| Held-out admission omits or drifts the signed Host build version | reject admission and keep the prior durable snapshot |
| Exact Provider response is recovered after IPC loss | accept it only inside the same committed Run/slot/request; do not count recovery as a second execution |
| Rehearsal audit is marked passed outside native held-out admission | normal decoder rejects the report |
| Public-sample Top-1, Recall@5, Recall@30 or MRR falls below the complete current baseline | fail the outer public benchmark; never preserve PASS through a weaker threshold |
| Public evaluator passes while no live/hidden evidence exists | retain its explicit offline scope and change no Design OS metric |

### 5. Good / Base / Bad Cases

- Good: strictly decode the current Commerce report, project its fixed source
  metrics through the Commerce adapter, hash the normalized report, regenerate
  the Design OS snapshot and compare it canonically before publishing progress.
- Base: deterministic Commerce evidence is complete while real Host evidence is
  absent. The report truthfully records maturity `contract`,
  exposes the eight real-Host blockers and keeps production readiness false.
- Bad: edit a Design OS snapshot's metric statuses and regenerate its summary,
  count an API success as usable material, let a later stage compensate for a
  failed Contract metric, change ruler weights/labels without a version bump,
  or present a perfect public-sample gate as official hidden-set SOTA.

### 6. Tests Required

- Exact current snapshot and human-readable offline command output.
- Missing, duplicate, reordered, relabeled, rebound-source and forged-summary
  rejection.
- Contiguous maturity under later-stage passes and earlier-stage failure.
- Newly passed metrics, stage transitions, coverage delta, maturity movement,
  critical regression and incompatible-ruler comparison.
- Clean-checkout snapshot directory creation and stable JSON round-trip.
- Commerce normal decoder continues to reject every untrusted real-host pass.
- Commerce runner/probe fixtures are explicitly non-benchmark; only a real
  native admission fixture backed by an evaluator-signed unseen run may derive
  newly passed metrics.
- The outer public baseline gate passes only at complete Top-1/Recall and MRR
  `1.0`; regress each field independently and assert failure. Its output must
  state offline/non-live/non-hidden/non-SOTA scope.

### 7. Wrong vs Correct

```ts
// Wrong: a structurally valid standalone report is treated as source proof.
const report = decodeDesignOsBenchmarkReport(JSON.parse(bytes))
publishProgress(report)

// Correct: regenerate from the owning strictly decoded Profile evidence.
const report = await createDesignOsBenchmarkFromCommerce({
  commerceReport: decodeCommerceProfileBenchmarkReport(sourceBytes),
  identity,
})
assertCanonicalSnapshotMatch(report, persistedSnapshot)
publishProgress(report)
```

```ts
// Wrong: executable route coverage is projected as benchmark progress.
if (runnerRoutes.every((route) => route.executable)) markRealHostPassed()

// Correct: capability and maturity remain separate authorities.
const pending = await runCommerceHeldOutProduction(input)
return pending.completionRequest
// The independent evaluator returns its signature out of band. No benchmark
// write occurs until createDesignOsBenchmarkFromCommerceHeldOutRehearsal
// performs dedicated native held-out admission.
```

```js
// Wrong: preserve a green public badge after category quality regresses.
const passed = summary.category.top1 >= 6 && summary.category.recallAt5 >= 10

// Correct: lock the complete reviewed baseline and keep its authority separate.
const passed = publicBenchmarkPasses(summary) // 11/11 and MRR 1.0 today
publishOfflineEvaluatorResult({ ...summary, passed })
// No Design OS snapshot or official competition claim is mutated here.
```
