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
prepareCommerceProjectInput(input): Promise<PreparedCommerceProjectInput>
runCommerceProjectProduction(input, host?): Promise<CommerceProjectProductionResult>
verifyCommerceHeldOutProductionRehearsal(input): Promise<HeldOutCommerceVerification>
benchmarkPublicSample(root): Promise<QianwenPublicBenchmarkReport> // outer Host only

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
- Public-sample accepted category ids may exist only in an outer evaluator that
  is excluded from the submission package closure. The runtime retrieves from
  catalog lineage, garment type, audience, usage context, plus-size and source
  attribute evidence; it must not import product ids, accepted answers or the
  evaluator module. The public report binds a source-closure SHA-256 and exposes
  raw rank, rank without the source-category field, title-only rank, catalog
  definition gaps and fact-level deterministic localization separately. A
  single aggregate PASS cannot hide a failed counterfactual or evidence gap.
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
- Semantic media QA is role-aware without weakening the final all-true gate.
  A detail crop passes identity only when at least two visible identity cues
  agree with the supplied facts and no visible cue conflicts. Whole-product
  features outside that crop are unknown, not contradictory; their absence
  alone cannot fail identity. Main images must keep the full product
  inspectable, and videos must preserve identity across inspected frames.
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
  Provider configuration/key checks because a completed external operation must be
  recoverable even if current configuration changed after settlement.
- The production runner performs every deterministic failure check before the
  single-use commitment: identity-anchor-first source selection, canonical
  source URLs and lineage admitted by the versioned fixed policy set,
  facts/catalog/graph construction,
  enabled keyed first-party DashScope authority, and the exact verified routes
  `qwen3.8-max`, `qwen-image-3.0`, `qwen3-vl-plus` and
  `wan2.7-i2v-2026-04-25`. `qwen-image-3.0-pro` is not substituted until its
  own Multimodal route has executable evidence.
- Source ingestion is not a general fetcher. Its policy set binds an exact
  policy id, HTTPS origin and non-root path prefix for either the competition
  AIB `/AI_Business/` source or the reviewed `dashscope-a717` generated-asset
  origin. Similar bucket names, other origins, root paths, redirects, embedded
  credentials, fragments and non-public DNS targets remain rejected before the
  single-use commitment.
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
- Desktop Project production is a separate authority domain from held-out
  evaluation. It accepts one bounded ordinary direct-product or nested product
  record, the two offline catalogs, and one to three local PNG/JPEG/WebP
  references. Local bytes replace remote image descriptors for that Run, are
  decoded and content-addressed before Provider preflight, and the first image
  remains the immutable identity anchor. The shared executor receives an
  optional held-out commitment from its caller; Project never supplies one.
- Project and held-out wrappers compile the same eleven-role Outcome DAG and
  call the same copy/image/QA/video/strategy executor. A strict completed
  Project result binds each retained delivery to its Run, Provider, Plan node,
  accepted source/DAG references, run locks, native receipt, QA receipt and
  export-safe filename. Project progress retains completed deliverables when a
  later node fails, but no partial Run becomes a completed result.
- Project mode is desktop-only. Browser downloads expose the exact retained
  bytes and a receipt manifest without adding an arbitrary destination writer.
  It does not expose Provider execution through CLI/MCP, mint evaluator
  authority, derive `productionReady`, or show `14/14`. The separate Benchmark
  tab remains the only UI that imports evaluator packages and admissions.
- Native admission and the derived `14/14` report are not complete until the
  operator can canonicalize and atomically publish the admitted evidence.
  Passing metrics omit the optional `diagnostic` property entirely; an own
  property whose value is `undefined` is not a persistable equivalent.
- The durable benchmark promoter accepts only the fixed private operator job
  store and native Host path. Before replaying admitted evidence on macOS it
  verifies the native Host against Cutout's pinned Developer ID designated
  requirement; path ownership or a valid signature from another team is not
  benchmark authority.
- The signed macOS operator verifies the adjacent runner's pinned Developer ID
  designated requirement before launch, and that runner verifies the adjacent
  native Host requirement before every request. Adjacency and file ownership
  alone do not close the release trust chain.
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
  Revalidating a durable admitted snapshot may consume its prior passed report
  only inside that same held-out verifier, which replaces every real-Host metric
  from the reverified bundle; the normal report decoder remains fail-closed.
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
| A role-appropriate detail crop omits an off-frame pocket, closure, or other whole-product feature while two or more visible identity cues agree and none conflict | Do not infer drift from absence; evaluate only visible evidence and keep the all-true QA gate |
| A detail crop visibly changes color, material, construction, marking, or another supplied identity cue | Fail product identity even when the crop is otherwise polished and usable |
| Category is not an exact leaf or attribute enum is absent | Reject catalog selection |
| Catalog attribute lacks matching normalized source evidence | Reject the localized description |
| Public accepted answers or product-id branches enter the submission package/runtime closure | Fail package validation; benchmark gold remains evaluator-only |
| Public Top-1 passes but source-category-free or title-only retrieval regresses | Fail the public benchmark and investigate semantic overfit before packaging |
| A top category has catalog definitions but zero source-backed values | Report `unbackedDespiteCatalogDefinitions`; do not hide it inside the zero-attribute total |
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
| Provider/source/catalog/route preflight is invalid | Reject before commitment or external Provider work |
| Exact settled request is retried after IPC response loss | Return the original signed response bytes without another Provider call |
| Retry changes request identity, stored response/HMAC is altered, or another process races settlement | Reject; never replace the first successful response or ledger slot |
| Source ingest is cancelled before receipt settlement | Abort the native HTTP future and leave the held-out slot unsettled |
| Project input omits a required JSON/catalog/image, uses an unsafe filename, exceeds a bound, has duplicate image content, or MIME bytes disagree | Reject before Provider execution with an actionable diagnostic |
| A Project receipt contains `heldOutCommitmentHash` or drifts from the exact Run/role/node/reference/lock closure | Reject the completed Project result; never present it as exportable completion |
| A Project node fails after earlier nodes complete | Stop the remaining dependent work, keep completed progress deliverables reviewable, and leave the Run incomplete |
| Raw evaluator files are malformed, unbounded, non-regular, normalize to other than one product, or lose identity-anchor-first selection | Reject before challenge signing and create no package |
| Pending inspection has bundle drift, receipt/byte mismatch, unsupported media, an existing output directory or a partial write | Reject, remove only the newly created partial directory, and sign nothing |
| Runner completes without evaluator completion attestation | Return pending admission; benchmark remains unchanged |
| Native admission succeeds but the admitted evidence contains an explicit `undefined` optional property | Reject publication, omit the property at its derivation owner, then recover and publish the exact sealed admission without another Provider call |
| Compared snapshot id/version/metric closure differs | Reject as incompatible; do not manufacture a delta |

### 5. Good / Base / Bad Cases

- Good: a desktop Project supplies one ordinary product record, both bounded
  offline catalogs and one to three decoded local references. The shared
  executor completes the exact eleven-role Plan; every retained delivery binds
  its source/Plan/lock/receipt/QA closure, exports its verified bytes, and every
  Project Provider receipt omits `heldOutCommitmentHash`.
- Good: bounded facts and catalogs compile eleven semantic Outcomes; the
  current durable benchmark reports deterministic `5/5`, real Host `8/8`, and
  production true only because the complete signed rehearsal bundle remains
  independently re-verifiable through the fixed native admission path.
- Good: public evaluator gold stays outside the Agent package; raw,
  source-category-free and title-only retrieval are each `11/11` Top-1, every
  catalog-defined top category has at least one source-backed attribute, and all
  `176/176` explicit convertible facts receive deterministic market displays.
- Base: one detail image fails dimensions. Evaluation keeps five of six images
  usable, repairs only that Plan node, preserves accepted sibling hashes, and
  records the repair receipt in strategy evidence.
- Base: a collar detail shows the locked color, material, collar construction,
  buttons and topstitching while lower pockets are outside the frame. QA passes
  identity because visible cues agree; it does not treat the crop as proof that
  the pockets were removed.
- Base: all generated images share one color, but the anchor names and depicts
  another SKU color. The run is internally consistent yet fails source
  fidelity, so it cannot pass the identity gate or raise the real-Host tier.
- Base: all eighteen Provider/QA calls and playback promotion verify, so the
  runner returns the exact bundle hash for evaluator completion while the
  durable benchmark remains unchanged until native admission succeeds.
- Base: a Project role fails or is cancelled after earlier roles settled. The
  UI retains those completed deliveries for review and individual download,
  but no complete result, manifest or benchmark claim is created for the
  partial Run.
- Good: IPC drops after a Provider image settled. The same request recovers the
  signed SQLite response and registered Keychain slot without a duplicate call.
- Bad: a caller marks real video as passed by supplying strings shaped like a
  receipt and artifact reference. Version 2 rejects the report rather than
  treating schema-shaped claims as authoritative Host evidence.
- Bad: retry with a changed prompt/reference set, regenerate an alternate
  receipt for one slot, treat a route probe as run evidence, or score a pending
  runner bundle before evaluator admission.
- Bad: copy a held-out commitment, `productionReady`, `14/14`, evaluator
  completion or admission field into a Project result, or rebuild exported
  bytes from model prose instead of the retained content-verified payload.

### 6. Tests Required

- Inventory and normalization: direct/nested shapes, deterministic lineage,
  explicit unknowns, HTML extraction, traversal, symlink, size/count, duplicate,
  unsupported, and malformed input rejection.
- Catalog and policy: deterministic indexes, exact leaf/enum closure, evidence-
  backed attributes, all three locales, spelling/units/sizing/prohibited claims,
  unresolved/unknown/unsupported citations, and fact conflicts.
- Public evaluator: exact reviewed source-file closure and fingerprint, raw and
  counterfactual Top-1/Recall/MRR, zero backed attributes split by catalog
  definition availability, fact-level localization closure, and a package scan
  proving public gold/product ids are absent from runtime files.
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
  closure, role-aware QA visibility rules, QA media metadata,
  original/promoted video receipts and exact
  `11 + 7 + 1` receipt closure. These tests are contract evidence only and may
  not be represented as a real run.
- Project production: direct and nested product shapes; required file and image
  counts; safe filenames; PNG/JPEG/WebP signature, byte, dimension and duplicate
  checks; first-reference identity authority; exact eleven-role order; Run,
  Provider, Plan, reference, lock, hash, filename, native receipt, seven QA and
  playback bindings; and strict rejection of every evaluator/benchmark field.
- Shared executor and UI: assert that Project Host contexts omit
  `heldOutCommitmentHash` while held-out contexts retain it; progress is ordered;
  failure/cancellation preserves settled deliveries without completing the Run;
  Project is the default mode; Benchmark state remains isolated; and previews,
  individual downloads, full download and manifest use retained bytes. Fixture
  Hosts and browser tests prove these contracts only, never live quality, real-
  Host maturity, hidden-set performance or SOTA.
- Evaluator CLI: real offline ingestion from the three raw competition file
  roles, strict prepared-input decoding, identity-anchor-first selection,
  exclusive output, pre-signing drift rejection, byte-exact pending inspection,
  private-directory materialization, partial-output cleanup and complete help
  discovery. These tests are handoff contracts and contribute zero score.
- Native replay: real HMAC/Minisign vectors, exact retry byte recovery, request
  drift, SQLite response/HMAC tampering, concurrent slot serialization, source
  cancellation, and complete ledger sealing. Capability probes remain distinct
  from benchmark evidence.
- Operator admission publication: canonicalize the complete admitted evidence,
  assert that passed metrics have no own `diagnostic` property, and replay the
  exact sealed native admission without repeating Provider work.
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

// Correct: normalization selects one evidence-backed authority; every Provider
// node receives it explicitly and may only narrow the evidence set.
const anchor = selectCommerceIdentityAnchor(facts)
await generateMain({ sourceFactIds: [anchor.id] })
await generateDetail({ sourceFactIds: [anchor.id], parentArtifactId: main.id })
```

```js
// Wrong: sample answers improve the submitted retrieval path.
import { PUBLIC_GOLD } from '../../scripts/qianwen-public-benchmark.mjs'
const categoryId = PUBLIC_GOLD[facts.productId]

// Correct: gold remains outside the package and stress-tests general retrieval.
const raw = catalogCandidates(facts, categories)
const withoutSourceCategory = catalogCandidates({ ...facts, category: undefined }, categories)
assertPublicRanks(raw, withoutSourceCategory, reviewedGold)
```

```ts
// Wrong: successful ordinary production is promoted into evaluator authority.
const result = await runCommerceProjectProduction(projectInput)
publishBenchmark({ productionReady: true, score: '14/14', result })

// Correct: validate and present Project deliveries only. Benchmark promotion
// remains a separate evaluator-completed, native-admitted workflow.
const result = commerceProjectProductionResultSchema.parse(
  await runCommerceProjectProduction(projectInput),
)
presentCommerceProjectDeliveries(result.deliverables)
```

## Scenario: Package A Locale-Closed Qianwen Commerce Agent

### 1. Scope / Trigger

Apply when the outer competition Host turns one normalized product plus the
official offline category and attribute catalogs into the exact eleven-file
Qianwen submission closure. This Host projection is portable Node 22 code; it
does not add a general Provider executor to Cutout's CLI/MCP surface and does
not change the evidence tier of the Design OS benchmark.

### 2. Signatures

```js
factLocalizationInventory(facts): LocalizationFact[]
factLocalizationInventoryCoverage(facts, inventory?): LocalizationCoverage
decodeFactTranslations(value, inventory): FactTranslation[]
indexFactTranslations(translations): Map<string, FactTranslation>
localizeFact(locale, key, value, translationIndex?): LocalizedFact
planImageRoleSources(facts): ImageRoleSourcePlan[]
runProduction(input): Promise<{ names: string[]; checks: A1A7Checks }>
validateRehearsal(outputRoot): Promise<QianwenRehearsalEvidence>
```

The executable accepts only `node agent.js --version` or
`node agent.js --prompt <official prompt>`. `DASHSCOPE_API_KEY` is required;
`AGENT_LOG_DIR` is optional. `DASHSCOPE_BASE_URL` or `OPENAI_BASE_URL` may be
the exact DashScope origin, `/api/v1` base, or `/compatible-mode/v1` base; the
Host normalizes those exact paths back to the pinned official origin.

### 3. Contracts

- One bounded `qwen3.8-max` structured-plan call owns copy, exact category and
  catalog selection, creative direction, and the residual fact-translation
  closure. `localizationFacts` contains stable ordered fact ids plus
  deterministic locale inputs. `factTranslations` must return the same count,
  order and ids, with exact `en`, `ko` and `pt` key/value objects.
- Deterministic unit conversion runs before model translation. Every numeric
  token and alphanumeric model/size token, including numeric-leading mixed-case
  values such as `3XL`, `3xl` and `3xL`, remains byte-exact. English and
  Portuguese translations reject Han, Hiragana, Katakana and Hangul; Korean
  rejects Han, Hiragana and Katakana and requires Hangul.
- The inventory limit is 80 residual facts. Entry 81 fails before Provider
  work; the Host never silently truncates required translations. Empty input
  requires an exact empty response. Completed and repair checkpoints are
  decoded again against the inventory derived from the current input digest.
- Locale documents use market-native category names and structural labels
  while preserving the exact category id. Raw source title/category/value,
  SKU id and JSON Pointer remain only in Host-owned source-reference or inline
  evidence tokens. Model-authored strings reject CR, LF and backticks.
- The offline validator accepts only the exact ordered headings, category
  declaration, source-label closure, media-role lines and locale-native empty
  SKU/attribute messages. Script checks may omit the fixed identity section and
  only the exact Host-owned SKU/source-value/pointer tokens; arbitrary code
  spans remain part of checked prose.
- Six image roles consume a deterministic role-to-source plan. The first
  reference is always the identity anchor; an optional second source supports
  the role; an optional third initial reference is the accepted hero for
  presentation consistency. During repair that last reference is explicitly
  the rejected candidate, never source authority. The fixed 0.0-5.0 second
  storyboard and actual QA/repair results are rendered into strategy output.
- Public gold, product ids and accepted-answer fields exist only in the outer
  repository evaluator. Package validation rejects any runtime import or
  identifier that couples the submitted 19-file Agent to that evaluator.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Translation is missing, reordered, duplicated or rebound to another fact id | reject the structured plan before media generation |
| Two source facts map to the same concept/value alias but disagree on a localized value | discard the ambiguous alias; if a catalog value remains source-script-bearing, reject before media generation |
| Numeric or protected model/size token changes case or content | reject as `invalid-model-output` |
| Target-language prose leaks another market script | reject the plan or completed output |
| Residual localization requires more than 80 facts | reject as `invalid-product`; never truncate |
| Model copy contains CR, LF, backtick, credential-shaped text or unsupported claims | reject before media generation |
| Rehearsal prose hides source-market script in an arbitrary code span | reject; only exact Host evidence tokens are exempt |
| Source label is missing or duplicated, heading order drifts, or locale category ids disagree | reject completed output |
| Base URL has another path, origin, credential, query, fragment or insecure production protocol | reject before Provider submission |
| Detail prompt leaves reference authority ambiguous | fail the prompt contract test; identify anchor, support and sibling/repair roles |
| Runtime source imports public benchmark gold or fixture product ids | fail package validation |

### 5. Good / Base / Bad Cases

- Good: 346 required public-sample residual facts produce an exact 346-entry
  request closure; all 176 convertible measurement facts localize
  deterministically; every detail role binds its best available non-anchor
  source while the identity anchor remains authoritative.
- Base: a product has no SKU or product attributes. The Host emits the exact
  locale-native empty closure, requests no unnecessary translations and still
  validates the required identity/media sections.
- Bad: treat a partial translation array as best effort, strip every Markdown
  code span before language validation, describe an unexplained third image
  reference, or import public accepted category ids into the submitted runtime.

### 6. Tests Required

- Empty, non-empty, exact 80-entry and rejected 81-entry inventories.
- Missing, reordered, numeric-drifted, exact-case model-drifted, script-leaking
  and backtick-injected translation responses; all fail before media work.
- English, Korean and Brazilian Portuguese labels, exact category-id agreement,
  locale-native empty closures, heading order, duplicate identity labels and
  arbitrary code-span/pointer-bullet attacks.
- Initial detail and targeted-repair prompts assert the exact reference order
  and authority; QA and strategy consume the same role-source plan.
- Official origin, `/api/v1`, `/compatible-mode/v1` and rejected arbitrary base
  paths; exact 19-file dependency-free package closure under Debian Node 22.
- Public benchmark tests are evaluator-only. Local Provider servers and media
  fixtures prove contracts and rejection paths but contribute no live quality,
  production maturity, hidden-set score or SOTA evidence.

### 7. Wrong vs Correct

```js
// Wrong: translate only the first convenient facts and hide the rest as source.
const translations = modelFacts.slice(0, 20)
renderDescription(facts, translations)

// Correct: derive and decode one exact ordered closure before any media work.
const inventory = factLocalizationInventory(facts)
const translations = decodeFactTranslations(plan.factTranslations, inventory)
const translationIndex = indexFactTranslations(translations)
renderDescription({ facts, translationIndex })
```

```js
// Wrong: arbitrary Markdown code is excluded from locale validation.
const checked = document.replace(/`[^`]*`/g, '')

// Correct: remove only exact Host-owned evidence tokens and check all prose.
const checked = proseWithoutExplicitEvidence(document, localeContract)
assertLocaleScriptClosure(checked, localeContract)
```

## Scenario: Accept The Competition Submission Entrypoint Contract

### 1. Scope / Trigger

Apply when the standalone Qianwen Commerce package is started by the evaluator
with one natural-language `--prompt`. This is an outer Host contract: it does
not change Commerce Profile semantics or add a public Cutout Agent operation.

### 2. Signatures

```js
parsePromptPaths(prompt: string): { inputRoot: string; outputRoot: string }
authorizeRoots({ inputRoot, outputRoot, logRoot? }): Promise<AuthorizedRoots>
main(['--prompt', prompt], environment): Promise<0>
```

The root archive entry remains `agent.js`. `DASHSCOPE_API_KEY` is required;
`AGENT_LOG_DIR` is optional and, when present, is a bounded absolute path to a
non-overlapping regular directory.

### 3. Contracts

- Prefer explicit line labels such as `输入目录`, `输出目录`, `Input directory`
  and `Output directory` before considering inline or narrative markers.
- Accept absolute paths wrapped in Markdown backticks, straight quotes, curly
  quotes or no quotes. Normalize only after removing the matched wrapper.
- A generic `输入` or `输出` marker requires an adjacent assignment/link token;
  it must not match prose such as `生成输出文件` or a basename inside a path.
- When `AGENT_LOG_DIR` is absent, use a no-file logger and write only below the
  evaluator-selected output root. Do not invent `/tmp`, a sibling log root or
  another caller-independent destination.
- When `HTTPS_PROXY` or `https_proxy` is present, every HTTPS Provider API,
  task-poll and result-download request must use that endpoint through HTTP
  CONNECT. `HTTP_PROXY` / `http_proxy` is the fallback only when no HTTPS proxy
  exists. Keep target TLS certificate verification enabled, never forward the
  DashScope authorization header in CONNECT, and reject proxy credentials,
  non-HTTP protocols or URL path/query/fragment components.
- Successful publication remains the exact eleven-file output closure. Package
  tests and local Provider fixtures prove the entrypoint contract only; they do
  not constitute a live Provider Run, hidden-set score or SOTA evidence.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Prompt is missing, oversized or contains NUL | reject as `invalid-prompt` |
| Explicit input/output label is absent | reject as `invalid-prompt` |
| Extracted path is relative or exceeds the path limit | reject before filesystem access |
| Input and output normalize to the same path | reject as `invalid-prompt` |
| Narrative contains `生成输出文件` before `输出目录` | ignore the generic word and use the explicit directory label |
| Path is wrapped in backticks or straight/curly quotes | remove the matching wrapper and preserve the enclosed absolute path |
| `AGENT_LOG_DIR` is absent | continue with the no-file logger |
| `AGENT_LOG_DIR` is relative, malformed, oversized, symlinked or overlaps input/output | reject as `invalid-log-path` or `invalid-path` |
| Platform proxy is present | route every allowed HTTPS request through CONNECT while retaining target TLS verification |
| Proxy URL contains credentials, a non-HTTP protocol, path, query, fragment or malformed control bytes | reject as `invalid-proxy` before Provider submission |

### 5. Good / Base / Bad Cases

- Good: the official Chinese task paragraph contains backtick-wrapped paths,
  `生成输出文件`, then explicit `输入目录` and `输出目录` lines; the exact roots
  are parsed and the Agent publishes eleven files without a log environment.
- Base: a controlled operator provides a separate absolute `AGENT_LOG_DIR`;
  sanitized diagnostics are written there and output closure is unchanged.
- Bad: the parser takes the first substring after the generic word `输出`,
  captures `文件并保存至`, then exits non-zero before Provider execution.

### 6. Tests Required

- Use the verbatim multiline Chinese Prompt shape with its preceding task
  paragraph and Markdown backticks; assert both canonical roots exactly.
- Run `main` with that Prompt and no `AGENT_LOG_DIR`; assert exit `0` and the
  exact eleven-file closure through the deterministic local Provider contract.
- Retain English, simplified Chinese, relative-path, same-path, curly-quote,
  symlink and overlapping-log negative coverage.
- Use a real local CONNECT listener to prove the selected proxy receives the
  exact `dashscope.aliyuncs.com:443` authority; a direct-fetch fixture is not
  sufficient evidence for this transport contract.
- Rebuild the ZIP, extract it outside the repository, run version, package
  validation and all package tests, then repeat in read-only network-disabled
  Debian `linux/amd64` Node 22.

### 7. Wrong vs Correct

```js
// Wrong: a generic marker can consume ordinary prose before the real label.
const output = firstMatch(/输出(?:文件夹|目录|路径)?\s*(\S+)/u, prompt)

// Correct: explicit labels and quoted-path forms win; generic words require
// an assignment token and cannot match `输出文件`.
const output = extractPrioritizedPath(prompt, {
  explicit: ['输出文件夹路径', '输出目录路径', '输出文件夹', '输出目录', '输出路径'],
  genericRequiresLink: ['输出'],
})
```
