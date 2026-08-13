# Commerce Production Profile

> Executable contracts for evidence-first commerce normalization, localized
> material production, evaluation, repair, and capability benchmarking.

## Scenario: Compile And Benchmark A Commerce Material Outcome

### 1. Scope / Trigger

Apply when supplied product records and offline marketplace catalogs are
normalized into a removable Commerce Profile, compiled through the Design OS
Kernel, evaluated as localized text/image/video/strategy materials, or measured
against the versioned Commerce benchmark. Competition packaging and scoring are
outer Host projections and do not alter this Profile.

### 2. Signatures

```ts
ingestCommerceInputs(files, limits?): CommerceIngestionResult
normalizeProductRecord(input): ProductFacts
selectCommerceIdentityAnchor(facts): ProductFact
compileGenerationPolicy(policy): CompiledGenerationPolicy
compileCommerceProduction(input): Promise<{ contract: ExecutionContract; plan: ExecutionPlan }>
evaluateCommerceProduction(input): CommerceEvaluationResult
createCommerceProfileBenchmarkReport(evidence): CommerceProfileBenchmarkReport
decodeCommerceProfileBenchmarkReport(input): CommerceProfileBenchmarkReport
compareCommerceProfileBenchmarkReports(prior, current): CommerceBenchmarkComparison
```

The durable current benchmark snapshot is
`src/commerce-profile/benchmarks/current.json`. Task directories may reference
it but must not own product benchmark history because task archival changes
their paths.

### 3. Contracts

- Input inventory accepts only bounded, allowlisted regular files below the
  supplied logical root. Product records normalize into `product-facts.v1`
  with JSON Pointer lineage and explicit unknown facts; HTML and media URLs
  remain untrusted data.
- The first explicit product-image fact is the immutable visual identity
  anchor. Its media role, source JSON Pointer, ordered descriptor, retained
  bytes, and content hash remain bound together. Description media and later
  SKU variants may add evidence but cannot replace or broaden that authority.
- Catalog selections must use an exact supplied leaf category plus permitted
  key/value enums. A catalog-valid value still requires normalized source-fact
  evidence before it may become an output claim.
- Every localized claim, visual overlay, and strategy narrative cites resolved,
  non-unknown fact ids. Locale policies compile into both model constraints and
  deterministic gates for spelling, units, sizes, claims, media, and documents.
- The Profile installs declarative schemas, semantic Outcome roles, policies,
  evaluators, and recipe nodes into the Kernel. It owns no Provider adapter,
  arbitrary network origin, output path, approval, or competition filename.
- Three localized descriptions, six image roles, one video role, and one
  strategy role share exact product-identity and creative-direction locks.
  Media kind must match the planned semantic role. Strategy evidence ids are
  unique and close over the actual facts, Plan nodes, routes, validations,
  receipts, and repairs.
- Localized product claims may be model-authored from resolved facts, but a
  model cannot predeclare what a later media file contains. After media QA, the
  Host projects each physical filename against its fixed semantic role; the
  completed-output validator rejects free-form media descriptions that can
  drift from delivered bytes.
- Image production, review, targeted repair, and image-conditioned video must
  inherit the same identity anchor through the DAG. Visual acceptance has two
  independent gates: source fidelity against that anchor and intra-run
  consistency across generated siblings. Passing one never implies the other.
- The benchmark identity and ordered 16-metric closure are versioned. Status,
  diagnostics, tier summaries, production frontier, and `productionReady` are
  derived; callers cannot author those report projections independently.
- Evidence tiers are `deterministic`, `mocked-host`, and `real-host`. Mocked
  success never satisfies real production. Version 1 has no trusted real-Host
  verifier, so even syntactically valid caller-authored real receipt/byte labels
  fail closed. Real metrics stay blocked until a later Host contract decodes
  authoritative receipts and recomputes artifact byte/hash/media bindings.
- Comparisons require the same benchmark id, version, and ordered metric
  closure. They emit exact transitions, newly passed metrics, and regressions;
  changing metric semantics requires a benchmark version change.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Traversal, symlink, duplicate, unsupported, oversized, or malformed input | Reject before normalization with an actionable diagnostic |
| HTML contains scripts or instruction-like text | Extract visible data only; never execute or trust embedded instructions |
| Description image or another SKU precedes the explicit product image in a flattened media list | Preserve media roles and select the first explicit product image as authority |
| Generated siblings are mutually consistent but drift from the anchor color/SKU | Fail source fidelity and product-identity preservation |
| One generated sibling matches the anchor but drifts from accepted siblings | Fail intra-run consistency and target only that sibling for repair |
| Category is not an exact leaf or attribute enum is absent | Reject catalog selection |
| Catalog attribute lacks matching normalized source evidence | Reject the localized description |
| Citation is missing, unresolved, unknown, or semantically unrelated | Emit a blocking fact-consistency finding |
| Artifact media kind, role, lock, dimensions, type, bytes, or playability differs | Reject only that Outcome frontier and retain valid siblings |
| Localized copy describes a generated media scene before that artifact exists | Ignore the predeclared description and project the QA-validated physical filename/role closure after execution |
| Strategy repeats evidence ids or omits actual Plan/receipt/repair closure | Fail strict decode or emit a blocking strategy finding |
| Benchmark metrics/assertions are missing, duplicated, or reordered | Reject the evidence/report closure |
| Report status, diagnostics, summary, or binding is caller-tampered | Reject because projections are not derived |
| Mock receipt backs a real metric | Reject; `productionReady` remains false |
| Caller labels evidence as a real receipt/byte pass in v1 | Fail closed until a trusted Host verifier is installed |
| Compared snapshot id/version/metric closure differs | Reject as incompatible; do not manufacture a delta |

### 5. Good / Base / Bad Cases

- Good: bounded facts and catalogs compile eleven semantic Outcomes; mocked
  receipts produce a complete evaluated artifact set; the benchmark reports
  deterministic 5/5, mocked 3/3, real 0/8 blocked, and production false.
- Base: one detail image fails dimensions. Evaluation keeps five of six images
  usable, repairs only that Plan node, preserves accepted sibling hashes, and
  records the repair receipt in strategy evidence.
- Base: all generated images share one color, but the anchor names and depicts
  another SKU color. The run is internally consistent yet fails source
  fidelity, so it cannot pass the identity gate or raise the real-Host tier.
- Bad: a caller marks real video as passed by supplying strings shaped like a
  receipt and artifact reference. Version 1 rejects the report rather than
  treating schema-shaped claims as authoritative Host evidence.

### 6. Tests Required

- Inventory and normalization: direct/nested shapes, deterministic lineage,
  explicit unknowns, HTML extraction, traversal, symlink, size/count, duplicate,
  unsupported, and malformed input rejection.
- Catalog and policy: deterministic indexes, exact leaf/enum closure, evidence-
  backed attributes, all three locales, spelling/units/sizing/prohibited claims,
  unresolved/unknown/unsupported citations, and fact conflicts.
- Profile and evaluation: removable schema registry, exact eleven-role graph,
  identity/creative locks, bounded Kernel Plan, accepted receipt closure, media-
  kind matching, 80% image usability, targeted repair, sibling preservation,
  unique strategy evidence, and Kernel gate projection.
- Media identity: product-image priority over description/SKU media, anchor
  role and JSON Pointer retention, request-level anchor inheritance through
  main/detail/repair/video nodes, same-color sibling drift, and the inverse
  case where siblings agree with one another but disagree with the anchor.
- Benchmark: exact metric/assertion order, three-tier summaries, mocked/real
  separation, forged real evidence rejection, receipt/artifact binding,
  tampered projection rejection, compatible deltas/regressions, incompatible
  snapshot rejection, and exact decode of the committed current snapshot.
- Before delivery run focused Commerce and Kernel tests, lint, strict TypeScript,
  `pnpm agent:validate`, production build, and `git diff --check`.

### 7. Wrong vs Correct

```ts
// Wrong: a typed label is not proof of real execution.
createCommerceProfileBenchmarkReport({
  metrics: [{
    metricId: 'p6.real-video-bytes',
    assertions: [{ id: 'artifact-bytes-present-and-decoded', verdict: 'passed' }],
    evidenceReferences: [{ kind: 'real-host-receipt' }, { kind: 'artifact-bytes' }],
  }],
})

// Correct in v1: keep the real frontier blocked until an authoritative Host
// verifier can decode receipts and recompute retained artifact-byte evidence.
const report = createCommerceProfileBenchmarkReport(currentEvidence)
if (!report.summary.productionReady) scheduleTrustedHostGate(report.summary.productionFrontier)
```

```ts
// Wrong: a flat list lets downstream nodes recreate visual authority.
const sourceUrls = facts.mediaUrls.slice(0, 3)

// Correct: normalization selects one evidence-backed authority; every paid
// node receives it explicitly and may only narrow the evidence set.
const anchor = selectCommerceIdentityAnchor(facts)
await generateMain({ sourceFactIds: [anchor.id] })
await generateDetail({ sourceFactIds: [anchor.id], parentArtifactId: main.id })
```
