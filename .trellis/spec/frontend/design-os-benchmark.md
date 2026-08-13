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
decodeDesignOsBenchmarkReport(input): DesignOsBenchmarkReport
compareDesignOsBenchmarkReports(prior, current): DesignOsBenchmarkComparison
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
- Maturity stages are ordered and contiguous: `contract -> conformance ->
  real-host -> production-rehearsal`. A later stage cannot skip or compensate
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
- Commerce v1 contributes five Contract metrics, three Conformance metrics,
  eight Real-Host metrics and one explicit Production-Rehearsal audit gate.
  The current truthful baseline is Contract `5/5`, Conformance `3/3`, Real Host
  `0/8`, Rehearsal `0/1`, maturity `conformance`, coverage `8/17`.
- Commerce real-host passage requires the exact eleven-artifact role closure,
  signed receipt/byte/role/node/lock/Plan bindings, internal Commerce evaluation,
  semantic media QA, playable video and a durable re-verifiable bundle. Native
  receipt authenticity alone cannot pass a Commerce benchmark metric.

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

### 5. Good / Base / Bad Cases

- Good: strictly decode the current Commerce report, project its fixed source
  metrics through the Commerce adapter, hash the normalized report, regenerate
  the Design OS snapshot and compare it canonically before publishing progress.
- Base: deterministic and mocked Commerce evidence is complete while real Host
  evidence is absent. The report truthfully records maturity `conformance`,
  exposes the eight real-Host blockers and keeps production readiness false.
- Bad: edit a Design OS snapshot's metric statuses and regenerate its summary,
  count an API success as usable material, let a later stage compensate for a
  failed Contract metric, or change ruler weights/labels without a version bump.

### 6. Tests Required

- Exact current baseline and human-readable offline command output.
- Missing, duplicate, reordered, relabeled, rebound-source and forged-summary
  rejection.
- Contiguous maturity under later-stage passes and earlier-stage failure.
- Newly passed metrics, stage transitions, coverage delta, maturity movement,
  critical regression and incompatible-ruler comparison.
- Clean-checkout snapshot directory creation and stable JSON round-trip.
- Commerce normal decoder continues to reject every untrusted real-host pass.

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
