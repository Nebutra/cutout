# Design OS evidence benchmark - technical design

## Architecture

`src/design-os-benchmark/` owns a Profile-neutral, versioned progress report.
It does not evaluate a design domain directly. Each Profile adapter must first
strictly decode its owning report, then project fixed metric definitions and
statuses into the general protocol. This keeps Commerce policy in Commerce and
prevents the benchmark core from becoming a collection of scenario branches.

The v2 ruler has one Profile, `commerce`, and fourteen fixed metrics. Existing
Commerce P1-P5 metrics map to `contract`, real P6-P7 metrics map to `real-host`,
and a Profile-owned
`production-rehearsal` blocker makes the final boundary explicit. Every metric
binds the source report identity and canonical SHA-256.

Simulated execution remains useful for deterministic orchestration regression
tests, but it is not an evidence tier and cannot appear in report metrics,
snapshots, maturity, coverage, or user-facing benchmark output.

The report derives:

- exact counts for every stage;
- coverage as passed metrics over the version-frozen closure;
- maturity as the last contiguous fully passed stage, or `unproven`;
- the first non-ready stage and all non-passing critical metrics;
- release readiness only when every metric and every stage passes.

Coverage is descriptive, not an authority override. Readiness and release
regression stay hard-gated.

## Trust Boundary

The generic v1 report-schema decoder validates exact v2 ruler definitions,
source bindings and every derived field. The Commerce adapter calls
`decodeCommerceProfileBenchmarkReport`
before projection. The durable Design OS snapshot can therefore be regenerated
from the durable Commerce report without Provider access.

Real-host Commerce reports remain a separate stronger boundary. The normal
decoder rejects every real-host pass; only the dedicated rehearsal path may
admit one, after re-verifying a complete signed bundle that reconstructs the
eleven publications, capability receipts, source-ingest provenance, graph/Plan
bindings, semantic QA and playback proof and calls
`evaluateCommerceProduction` internally. This bundle does not by itself prove
that its input was held out from development or prior rehearsals, so the final
production-rehearsal metric remains blocked until an independent challenge
attestation can be reverified. The durable current baseline has no signed
bundle, so all eight real-host metrics are blocked as well.

The held-out boundary is a three-link internal desktop protocol. First, the
independent evaluator signs a bounded pre-run challenge selection with
`CUTOUT_COMMERCE_EVALUATOR_PUBKEY` as the build-pinned trust root. That payload
binds challenge protocol v2, Commerce benchmark and Profile, challenge id and
nonce, exact facts/catalog/source manifest hash, the only allowed Run id,
evaluator key id, issue/expiry window and the authoritative Cutout Host build
version. The evaluator derives that version from matching package/Cargo source
versions. Rust verifies the signature, window and exact
`env!("CARGO_PKG_VERSION")` value before issuing a Keychain-HMAC commitment over
the exact challenge hash, input manifest, Run and build version.

The commitment hash then crosses the execution boundary as a signed field on
every native source-ingest, Provider, semantic-QA and playback-promotion
receipt. Normal production receipts may omit the field, but the dedicated
held-out verifier requires exact equality on the complete receipt closure. This
makes host timestamps defense in depth instead of the source of pre-run truth:
rolling the local clock back cannot add a new commitment to an already settled
Run.

After the complete Commerce bundle settles, Rust re-verifies the challenge and
verifies a second evaluator Minisign payload. The completion payload closes over
the challenge hash, key, Host build version, commitment, input manifest, Run,
exact bundle hash, accepted decision and eleven-deliverable count. Final
admission repeats that build version and Rust checks it against the compiled
version again. Challenge, commitment, completion and admission v2 reject legacy
v1 or version drift. No key means
`capability-required`, so the current snapshot remains blocked.

The challenge hash is also a durable native replay key. Commitment issuance is
idempotent for the exact signed challenge within its validity window and
returns the same registered commitment after an IPC retry; it cannot mint a
second commitment for the same challenge. A Keychain-backed execution ledger
then accepts at most one successful signed receipt for each selected-source, frozen Plan node,
semantic-QA node and playback-promotion slot. Final admission requires the
ledger to equal the bundle receipt closure exactly and seals it to the accepted
bundle hash and evaluator attestation. The allowed Run id alone is not treated
as proof of a single attempt.

Receipt hashes alone are insufficient for idempotency when native work settles
but the renderer never receives the Tauri response. The host therefore writes
the complete serialized response to an owner-only app-data SQLite database
before it registers the successful Keychain slot. Each row is HMAC-signed over
commitment, Run, slot, exact request hash and response hash. `BEGIN IMMEDIATE`
serializes the SQLite/Keychain read-modify-write sequence across app processes;
the first successful row wins. Exact retry recovers the original receipt and
bytes before checking current Provider configuration or key availability, while
request drift or database/HMAC tampering fails closed. Keychain/HMAC remains the
trust authority; SQLite is a signed durable response carrier.

`runCommerceHeldOutProduction` is the executable desktop owner. Before issuing
the one-shot commitment it validates the immutable identity anchor as source
one, canonical fixed-origin source lineage, facts and both catalogs, frozen
graphs, an enabled keyed first-party DashScope Provider, and verified routes for
`qwen3.8-max`, `qwen-image-3.0`, `qwen3-vl-plus` and
`wan2.7-i2v-2026-04-25`. The pro image model is not selected because it has no
registered executable Multimodal route.

After commitment, one to three cancellable native source ingests produce the
content-addressed source inventory. The runner freezes Contract/Plan/run locks,
then performs eighteen Provider/QA calls: three localized descriptions, six
reference-conditioned image edits, six image QA calls, one image-conditioned
video, one video QA and one evidence-exact strategy. Main image references every
selected source; details reference source one then the retained main publication;
video references that same main publication. Dependent receipts include the
content-derived DAG lock. Native playback promotion retains the original video
Provider receipt separately, and the final closure is eleven Provider, seven QA
and one playback-promotion receipt plus source receipts.

The source command separates its cancellation UUID from the deterministic
operation request id stored in the receipt. Abort drops the HTTP future before
settlement and leaves no successful slot. A fully verified bundle still returns
only `commerce.held-out-pending-admission.v1`; independent evaluator completion
and native admission remain external authority and are the only way to change
benchmark status.

The renderer now has one lazy Commerce production operator surface instead of a
dead library export. It imports an evaluator package whose embedded manifest is
re-derived from normalized facts and catalogs before any native commitment,
loads only eligible Keychain-backed first-party DashScope Providers, owns the
AbortController, and exports the complete pending bundle. Importing that same
pending bundle after restart remains safe because native replay recovery is the
execution authority. A completion import invokes the existing native admission
path; the panel shows 14/14 only from the returned fully derived report.

The independent evaluator uses `pnpm commerce:evaluator` outside the Cutout
execution host. Its offline `prepare` command accepts one raw product JSON and
the two raw competition catalogs as bounded regular files, calls the same real
Commerce ingester as the product, requires exactly one normalized product and
selects only its immutable identity anchor by default. It emits a strict input
file exclusively and contributes no evidence. `challenge` revalidates that
selection, verifies package/Cargo version equality and signs the resulting Host
build version. The secret key is never read by Node or included in a
handoff; the CLI passes a protected file to `minisign` with `shell:false`,
verifies the result against the build-pinned public key, and writes files
exclusively. Before review, `inspect` strictly decodes the pending bundle and
materializes its exact source, Provider, derived-delivery, semantic-QA and video
bytes under fixed safe filenames in one newly created owner-only directory. It
rechecks receipt artifact ids, hashes and lengths and removes partial output on
failure. The generated review template closes over all eleven semantic roles,
artifact hashes, receipt ids, semantic-QA ids and playback status. Completion
refuses to sign until an identified evaluator explicitly accepts that unchanged
closure.

The renderer reconstructs the manifest and complete Commerce evaluation, but
cannot supply a public key or verification result. Rust independently
reconstructs the manifest, canonical bundle hash, receipt commitment closure
and chronology from the completed bundle. The complete bundle verifier remains
authoritative for source ingest, every artifact/QA receipt and byte payload,
graph/Plan/lock/DAG closure, semantic QA, playable video and internal evaluation.
Only after native admission and full verification may the dedicated Design OS
path pass the audit metric; the normal decoder rejects that state.

## Closed Non-GUI Operator

The renderer is not an execution authority. The production runner receives one
`CommerceProductionHost` that owns Provider enumeration/preflight, held-out
commitment, selected-source ingestion, structured text, image, vision QA, video,
receipt verification, playback promotion and final admission. The existing
desktop adapter maps that contract to Tauri invoke. A second adapter maps it to
the closed Commerce operator protocol. Runner orchestration and bundle assembly
remain single-source TypeScript; trust, secrets, network traffic, receipts and
replay settlement remain single-source Rust.

`cutout-commerce-operator` is a product binary, not an extension of
`cutout.control.v1`. It creates no Tauri window or WebView and accepts a bounded
JSON envelope on standard input whose discriminant is one of `preflight`, `run`,
`recover`, `admit`, `status` or `cancel`. Inputs contain an opaque job id and
strict evaluator/pending/completion data only. The binary resolves its own
private application-data root, rejects symlinks and non-regular/oversized input,
serializes job transitions, and atomically publishes fixed result filenames.
There is no caller-selected root, destination, Provider URL, raw native command,
credential or arbitrary payload forwarding.

The operator process and its TypeScript runner communicate through a fixed,
versioned native request union. Each request is decoded twice: strict schema at
the TypeScript owner and serde validation at the Rust owner. Cancellation uses
one opaque job-scoped token while deterministic operation request ids continue
to identify replay slots. A crash or IPC loss can resume the exact job from the
native replay ledger; changed request/package bytes fail closed.

The first authoritative operator release advances the product and Host build to
`0.1.21`. That invalidates the existing `0.1.20` challenge for this purpose.
After the evaluator trust root is injected into the release build, the evaluator
must create a fresh challenge bound to `0.1.21`; only its admitted bundle may
regenerate the durable benchmark snapshots.

The pre-commit source boundary uses a versioned fixed policy set instead of one
competition-sample bucket. Each policy binds one exact HTTPS origin and non-root
path prefix. The initial closure admits the official AIB `/AI_Business/` source
and the exact reviewed DashScope generated-asset origin, while preserving DNS
pinning, disabled redirects, byte limits and rejection of similar or arbitrary
hosts. This lets an evaluator create a genuinely fresh product after code freeze
without turning Commerce ingestion into a generic URL fetcher.

## Compatibility And Rollback

Benchmark comparisons require equal id and version. Adding another Profile or
changing mappings creates a later ruler version; ruler-v1 historical snapshots are
incompatible with v2 and are not accepted as current evidence. The benchmark
module remains observational and does not mutate Design IR, execute Providers or
change public Agent capability claims. The separate internal desktop runner executes only
when explicitly called with a signed challenge and existing Provider authority;
it is not exposed through CLI/MCP. Rollback removes the projection/runner and
internal commands without changing admitted Commerce evidence.
