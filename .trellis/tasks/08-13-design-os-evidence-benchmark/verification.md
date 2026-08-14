# Verification

Verified on 2026-08-14 without paid Provider calls or simulated Host scoring.

- Focused Commerce/Design OS/Tauri-capability/evaluator/UI Vitest: 91 tests passed across 13 files. Runner contract tests use only pure synthetic values and contribute zero score; fixture receipts and substituted native verifiers exercise verifier contracts and rejection paths only. They establish no real-Host maturity.
- Real Playwright operator flow: 2 tests passed across desktop and mobile Chrome. The browser creates a project, opens `Create -> Open system inspector -> Commerce`, verifies the truthful `5/14` state, and proves the panel and every control stay inside the dialog after the mobile resize. No Provider/native mock is installed by this test.
- Focused held-out Rust tests: 7 protocol tests passed, including a real Minisign vector, missing-key `capability-required`, bounded challenge expiry/identity checks, rollback/chronology rejection, cross-runtime canonical payload encoding, one-successful-receipt slot rejection, durable exact-response recovery, first-response-wins behavior, request drift, response tampering and HMAC-signature tampering. These are protocol verification, not benchmark evidence.
- Full Rust library regression: 274 tests passed and 4 environment-dependent tests were ignored. `cargo check --lib` and scoped `rustfmt --check` for the Commerce held-out/native receipt files passed. Full `cargo fmt --check` is blocked only by the concurrently modified `game_asset_generation.rs`, which this task does not own.
- Forced TypeScript (`tsc -b --pretty false --force`) passed.
- `pnpm lint`: passed.
- `pnpm build`: passed Agent/product-skill validation, strict TypeScript, Vite compilation and the frontend bundle gate. The entry is 445.4 KiB against the 450.0 KiB limit; Commerce remains a separate 148.3 KiB lazy chunk.
- Full Vitest: 2487 tests passed, 16 skipped and 12 failed across four concurrently modified files (`release-notes.test.ts`, `agent-response-regenerate.e2e.test.tsx`, `material-processing-routing.e2e.test.tsx` and `prototype-all-routes.e2e.test.tsx`). The 91-test scoped task suite remains green; this task does not own those failures.
- `pnpm benchmark:design-os`: source regeneration and durable snapshot comparison passed; Contract `5/5`, Real Host `0/8`, Production Rehearsal `0/1`, maturity `contract`, coverage `5/14` (`35.71%`), production ready `no`.
- `pnpm agent:validate`: 20 operations, 36 MCP tools, 20 product skills and the Codex plugin validated.
- `rtk git diff --check`: passed.
- Source-ingest cancellation is covered by a no-mock source contract: the opaque native cancellation UUID stays separate from the deterministic signed operation request id, and replay settlement remains inside the cancellable Rust future.
- The runner now compiles canonical Contract/Plan documents with stable preflight-only source identities before commitment issuance; the retained Plan is recompiled after native ingest with real content-addressed source ids.
- The evaluator CLI now prepares a strict input directly from one raw product
  JSON and the two raw competition catalogs through the real bounded ingester.
  It defaults to the immutable identity anchor, creates output exclusively, and
  `challenge` rejects source-selection drift before the external signer runs.
  This is evaluator operability, not benchmark evidence.
- Evaluator `inspect` now expands the strict pending bundle into fixed source,
  deliverable, derived Markdown, semantic-QA and video filenames under a new
  private directory, checks receipt artifact ids/hashes/lengths, generates the
  exact review template, rejects overwrite and removes partial output after
  byte drift. Inspection is human-review operability and contributes zero score.

Commerce benchmark version 2 has an exact 13-metric closure: five deterministic
contract metrics and eight real-Host metrics. Design OS ruler version 2 has an
exact 14-metric closure after adding the explicit rehearsal gate. The signed
`.cutout` rehearsal bundle is still absent, so no Run 6 or competition package
evidence has been promoted to a product real-Host pass. Even a future complete
signed bundle cannot pass the final rehearsal metric until held-out input
selection is independently bound and re-verifiable.

## Held-out attestation increment

- The evaluator now signs the exact pre-run challenge selection. Rust verifies
  its benchmark/Profile versions, challenge id and nonce, selected-input
  manifest, only allowed Run, evaluator key id, bounded issue/expiry window and
  Host build version against the build-pinned Minisign key before issuing a
  Keychain-HMAC commitment.
- The signed commitment hash is an optional ordinary receipt field but is
  mandatory and exact on every held-out source-ingest, Provider, semantic-QA,
  playback source and playback-promotion receipt.
- Final native admission reconstructs the input manifest from the completed
  bundle, recomputes the canonical bundle hash, verifies every native receipt
  and retained byte payload, re-verifies the pre-run signature, and verifies a
  completion signature over challenge, commitment, input, Run, bundle,
  accepted decision, eleven deliverables and completion time. Local chronology
  remains defense in depth rather than authority.
- The evaluator challenge is registered as one native commitment. A durable
  Keychain replay ledger accepts one successful signed receipt per source,
  frozen Plan, semantic-QA and playback-promotion slot, rejects alternate
  attempts, requires an exact bundle/ledger closure and seals the accepted
  commitment to one bundle and evaluator completion.
- No trusted evaluator key is committed in this build. The production path
  returns `capability-required`; current evidence and snapshots remain unchanged.
- The current shell has no `CUTOUT_COMMERCE_EVALUATOR_PUBKEY`, and the execution
  host has no `minisign` binary. An independent evaluator must provide and retain
  those authorities on the proper build/evaluator hosts before a paid Run can
  issue its first commitment; Cutout must not synthesize them locally.
- Run 6 predates the evaluator-signed challenge and receipt-carried commitment;
  it is not importable or retro-signable.
- Fixture-native substitutions exercise the complete Commerce verifier but
  contribute zero real-Host or production-rehearsal passes.

## Host build protocol v2 increment

- Challenge, commitment, evaluator completion and admission now use explicit v2
  protocols. The evaluator derives `hostBuildVersion=0.1.20` only when
  `package.json` and `src-tauri/Cargo.toml` agree, then signs it into both
  evaluator payloads. Rust checks that value against
  `env!("CARGO_PKG_VERSION")` before commitment and during final admission.
- Final Commerce admission and Design OS capability-audit evidence expose the
  same build version. Strict decoders and native tests reject legacy v1,
  omitted values, version drift and completion/challenge disagreement.
- Focused evaluator/held-out/runner Vitest passed `25/25`, and the complete
  scoped Commerce/Design OS suite passed `91/91`; focused held-out Rust tests
  passed `7/7`, including the real Minisign primitive vector and the updated
  cross-runtime canonical v2 challenge vector.
- Forced TypeScript, `cargo check --lib`, scoped `rustfmt --check`, lint, Agent
  validation and `git diff --check` passed. The offline Design OS validator
  remains Contract `5/5`, Real Host `0/8`, Production Rehearsal `0/1`, coverage
  `5/14` (`35.71%`) and production ready `no`.
- The production runner now derives its v2 completion request through a tested
  constructor that copies `commitment.hostBuildVersion`; pending-handoff decode
  also checks exact equality. B19 is closed, while the benchmark remains
  unchanged until a real independently admitted Run exists.
