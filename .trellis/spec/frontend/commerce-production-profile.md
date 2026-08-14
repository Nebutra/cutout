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
createCommerceHeldOutInputManifest(input): CommerceHeldOutInputManifest
createCommerceHeldOutCommitment(input): Promise<CommerceHeldOutCommitment>
runCommerceHeldOutProduction(input, host?): Promise<CommerceHeldOutPendingAdmission>
verifyCommerceHeldOutProductionRehearsal(input): Promise<HeldOutCommerceVerification>

ai_ingest_competition_source_image(
  request_id: Option<String>,              // cancellation UUID
  operation_request_id: String,            // signed receipt identity
  run_id: String,
  held_out_commitment_hash: Option<String>,
  fact_id: String,
  source_file: String,
  source_pointer: String,
  source_url: String,
): Result<CommerceSourceIngestResult, ProxyError>
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
- The benchmark identity and ordered 13-metric closure are versioned. Status,
  diagnostics, tier summaries, production frontier, and `productionReady` are
  derived; callers cannot author those report projections independently.
- Evidence tiers are exactly `deterministic` and `real-host`. Simulated Host
  execution is test infrastructure, never a scored metric, evidence kind,
  snapshot entry, readiness input or production claim. Version 2 rejects
  caller-authored real receipt/byte labels; real passes are admitted only through
  the trusted rehearsal path that re-verifies the complete signed bundle.
- Held-out admission begins with an evaluator-signed, bounded pre-run challenge
  selection. Rust verifies it against the build-pinned Minisign trust root
  before issuing a Keychain-HMAC commitment. The challenge binds benchmark and
  Profile versions, challenge id/nonce, exact facts/catalog/selected-source
  manifest hash, the only allowed Run id, evaluator key id, issue/expiry window
  and authoritative Host build version. The evaluator emits challenge v2 only
  after package/Cargo versions agree, and Rust checks the signed value against
  `env!("CARGO_PKG_VERSION")` before commitment.
- That commitment hash is signed into every admitted source-ingest, Provider,
  semantic-QA and playback-promotion receipt. Ordinary receipts may omit the
  field, but held-out admission requires exact equality across the complete
  closure. After bundle completion, Rust re-verifies both evaluator signatures,
  every native receipt and retained byte payload, and a completion attestation
  that binds challenge, Host build version, commitment, input, Run, exact bundle
  hash, accepted decision, deliverable count and completion time. Final
  admission exposes that same build version and Rust checks it against the
  compiled version again. Legacy v1, missing or drifted version fields fail
  closed. The renderer cannot supply a
  public key or verification boolean, and a missing trust root is
  `capability-required`.
- Each evaluator challenge is a durable native single-use key. Exact IPC retries
  within the challenge window return its already registered commitment; a
  second commitment cannot be issued. A Keychain-backed ledger accepts at most one successful receipt per
  source, frozen Plan, semantic-QA and playback-promotion slot, and final
  admission requires the exact ledger closure before sealing one bundle and
  completion attestation. A shared Run id cannot authorize cherry-picking.
- A successful held-out native operation persists its complete serialized
  response before settling the Keychain receipt slot. The app-data SQLite row
  binds commitment, Run, execution slot and exact request hash, is signed by the
  same host HMAC authority, and is written under `BEGIN IMMEDIATE` so separate
  app processes cannot race the Keychain read/modify/write cycle. Exact retry
  returns the original receipt and bytes; request drift, response tampering or
  a regenerated alternate response fails closed. Unix app-data directories and
  database files remain owner-only. Replay recovery runs before current
  Provider configuration/key checks because a completed paid operation must be
  recoverable even if current configuration changed after settlement.
- The production runner performs every deterministic failure check before the
  single-use commitment: identity-anchor-first source selection, canonical
  fixed-origin source URLs and lineage, facts/catalog/graph construction,
  enabled keyed first-party DashScope authority, and the exact verified routes
  `qwen3.8-max`, `qwen-image-3.0`, `qwen3-vl-plus` and
  `wan2.7-i2v-2026-04-25`. `qwen-image-3.0-pro` is not substituted until its
  own Multimodal route has executable evidence.
- One runner execution closes exactly eleven primary Provider receipts, seven
  semantic-QA receipts and one playback-promotion receipt, in addition to one
  to three source-ingest receipts. Main image input is every selected source in
  frozen Plan order; each detail is the first selected source plus the retained
  main publication; video is conditioned on that same retained main publication.
  Every dependent media receipt carries its content-derived DAG lock. The
  original video Provider receipt is retained separately from the promoted
  playback receipt, strategy references the ten publication artifact ids, and
  cross-slot receipt-id reuse is rejected.
- Source download uses the shared native cancellation registry. Its cancellation
  UUID is separate from the deterministic receipt request id; abort before
  settlement drops the HTTP future and registers no held-out receipt slot.
  Successful settlement remains durably replayable if renderer response
  delivery is subsequently lost.
- A successfully verified runner bundle returns a pending evaluator-completion
  request. It does not call admission, mint an evaluator signature, update a
  benchmark or claim production readiness.
- The runner must have a real lazy desktop operator. Its package import
  re-derives the exact input manifest, its Provider selector exposes only
  enabled keyed first-party DashScope authority, its cancellation owns the
  complete Run, and importing the same pending bundle after restart is a replay
  recovery rather than a second attempt. The UI may show 14/14 only after the
  completion import returns from native admission.
- The evaluator signer is a separate CLI/host role. It never stores or reads the
  evaluator private key in Cutout code. Its offline preparation path converts
  one raw product JSON and the exact category/attribute catalogs through the
  bounded Commerce ingester, requires one normalized product, and selects only
  the immutable identity anchor by default. Challenge creation revalidates that
  source selection before passing the protected key path directly to `minisign`
  without a shell. It immediately verifies every signature against the public
  key. Before completion, its inspection path strictly decodes the pending
  bundle, rechecks the bundle hash, validates every retained source, Provider and
  semantic-QA payload against its receipt artifact id/hash/length, and writes
  only fixed safe filenames into a newly created owner-only directory. Partial
  output is removed on failure and an existing directory is never overwritten.
  The evaluator must explicitly review all eleven materialized deliverables
  before signing completion. Preparation, inspection, signer tooling and review
  contribute no benchmark evidence.
- The bundle-only rehearsal verifier may exercise receipt, byte, graph/Plan,
  semantic QA, playback and evaluation contracts, but it retains the `0/8`
  real-Host baseline. Only native held-out admission may derive real-Host passes.
  Commitment issuance precedes every source/Provider start and evaluator
  completion follows every artifact completion; an existing run cannot be
  retro-signed.
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
| Simulated receipt backs a real metric | Reject at strict decode; `productionReady` remains false |
| Caller labels evidence as a real receipt/byte pass in v2 | Fail closed outside the trusted rehearsal verifier |
| Trusted evaluator key is absent, malformed or differs from the committed key id | Return `capability-required` or reject; keep the benchmark blocked |
| Challenge is unsigned, expired or identity-drifted; any receipt omits the commitment; completion precedes artifact settlement; or Run/input/bundle identity drifts | Reject held-out admission |
| Challenge, commitment, completion or admission uses legacy v1, omits `hostBuildVersion`, or differs from the compiled Host version | Reject before commitment or final admission; change no metric |
| Provider/source/catalog/route preflight is invalid | Reject before commitment or paid work |
| Exact settled request is retried after IPC response loss | Return the original signed response bytes without another Provider call |
| Retry changes request identity, stored response/HMAC is altered, or another process races settlement | Reject; never replace the first successful response or ledger slot |
| Source ingest is cancelled before receipt settlement | Abort the native HTTP future and leave the held-out slot unsettled |
| Raw evaluator files are malformed, unbounded, non-regular, normalize to other than one product, or lose identity-anchor-first selection | Reject before challenge signing and create no package |
| Pending inspection has bundle drift, receipt/byte mismatch, unsupported media, an existing output directory or a partial write | Reject, remove only the newly created partial directory, and sign nothing |
| Runner completes without evaluator completion attestation | Return pending admission; benchmark remains unchanged |
| Compared snapshot id/version/metric closure differs | Reject as incompatible; do not manufacture a delta |

### 5. Good / Base / Bad Cases

- Good: bounded facts and catalogs compile eleven semantic Outcomes; the
  benchmark reports deterministic `5/5`, real Host `0/8` blocked, and production
  false until the complete signed rehearsal bundle is independently verified.
- Base: one detail image fails dimensions. Evaluation keeps five of six images
  usable, repairs only that Plan node, preserves accepted sibling hashes, and
  records the repair receipt in strategy evidence.
- Base: all generated images share one color, but the anchor names and depicts
  another SKU color. The run is internally consistent yet fails source
  fidelity, so it cannot pass the identity gate or raise the real-Host tier.
- Base: all eighteen Provider/QA calls and playback promotion verify, so the
  runner returns the exact bundle hash for evaluator completion while the
  product benchmark remains `5/14` until native admission succeeds.
- Good: IPC drops after a paid image settled. The same request recovers the
  signed SQLite response and registered Keychain slot without paying again.
- Bad: a caller marks real video as passed by supplying strings shaped like a
  receipt and artifact reference. Version 2 rejects the report rather than
  treating schema-shaped claims as authoritative Host evidence.
- Bad: retry with a changed prompt/reference set, regenerate an alternate
  receipt for one slot, treat a route probe as run evidence, or score a pending
  runner bundle before evaluator admission.

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
- Benchmark: exact metric/assertion order, two-tier summaries, exclusion of
  simulated Host evidence, forged real evidence rejection, receipt/artifact binding,
  tampered projection rejection, compatible deltas/regressions, incompatible
  snapshot rejection, and exact decode of the committed current snapshot.
- Runner: pure preflight tests for Provider/source/route/category rejection,
  exact main/detail/video reference order and DAG locks, publication-id strategy
  closure, QA media metadata, original/promoted video receipts and exact
  `11 + 7 + 1` receipt closure. These tests are contract evidence only and may
  not be represented as a real run.
- Evaluator CLI: real offline ingestion from the three raw competition file
  roles, strict prepared-input decoding, identity-anchor-first selection,
  exclusive output, pre-signing drift rejection, byte-exact pending inspection,
  private-directory materialization, partial-output cleanup and complete help
  discovery. These tests are handoff contracts and contribute zero score.
- Native replay: real HMAC/Minisign vectors, exact retry byte recovery, request
  drift, SQLite response/HMAC tampering, concurrent slot serialization, source
  cancellation, and complete ledger sealing. Capability probes remain distinct
  from benchmark evidence.
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

// Correct in v2: keep the real frontier blocked until the trusted rehearsal
// verifier decodes the complete signed bundle and recomputes retained evidence.
const report = createCommerceProfileBenchmarkReport(currentEvidence)
if (!report.summary.productionReady) scheduleTrustedHostGate(report.summary.productionFrontier)
```

```ts
// Wrong: an executable runner or route probe is treated as benchmark evidence.
const pending = await runCommerceHeldOutProduction(input)
publishBenchmark({ productionReady: true, bundleHash: pending.completionRequest.bundleHash })

// Correct: only independent completion plus native admission may advance it.
const pending = await runCommerceHeldOutProduction(input)
return pending.completionRequest // transfer is owned by the independent evaluator
// Benchmark remains unchanged until verifyCommerceHeldOutProductionRehearsal
// re-verifies the signed completion and exact retained bundle.
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
