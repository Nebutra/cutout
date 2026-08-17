# Verification

Verified on 2026-08-14 without real external Provider calls or simulated Host scoring.

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
- The following authority status is an operator-recorded observation from the
  external build/evaluator hosts; this terminal-only repository review did not
  launch or control the GUI and does not independently re-attest those hosts.
- No evaluator trust root is committed to the repository. The locally rebuilt
  `/Applications/Cutout.app` `0.1.20` instead has the independent evaluator
  public key injected at compile time, with trusted key id
  `evaluator:minisign:sha256:61eee4bafacf487b2175d550690f506d8a283189a2fa7e2404a59b748e907d47`.
  A build without that injected public key still returns
  `capability-required`; current evidence and snapshots remain unchanged.
- The evaluator host has `/opt/homebrew/bin/minisign`, while its private key
  remains outside Cutout under owner-only local authority. The evaluator used
  the competition's official public `Task_Data.zip` sample to select one of
  eleven products independently and emitted a signed v2 challenge for Run
  `run:commerce-held-out:c2721fc5-e03d-417a-9df0-4d5177a8cf45`. This is an
  independently held-out rehearsal over public sample data, not the hidden
  competition test set and not an official competition score.
- The installed local App reports `0.1.20` and passes
  `codesign --verify --deep --strict`; it is ad-hoc signed local evidence, not
  notarized public-release evidence. No pending Provider bundle, evaluator
  review/completion or native admission exists, so the benchmark remains
  truthfully `5/14`.
- Run 6 predates the evaluator-signed challenge and receipt-carried commitment;
  it is not importable or retro-signable.
- Fixture-native substitutions exercise the complete Commerce verifier but
  contribute zero real-Host or production-rehearsal passes.

## Terminal-only startup review

- This review did not launch, activate, focus, click, capture or otherwise
  control the App GUI. The packaged-E2E runner, window-lifecycle source contract
  and Tauri capability synchronization tests passed `75/75`; the production
  contract requires the first Tauri React commit to precede `show()` and forbids
  a hidden-window `requestAnimationFrame` dependency.
- Lint, `cargo check --lib`, direct Vite production build, the frontend bundle
  gate, Agent validation, benchmark validation and `git diff --check` passed.
  The forced TypeScript check and composite `pnpm build` are currently blocked
  by an out-of-scope shared-worktree type mismatch in
  `src/game-asset-profile/rehearsal.ts:281`; neither command reported an error
  in the startup or Commerce held-out files reviewed here.
- The benchmark remains Contract `5/5`, Real Host `0/8`, Production Rehearsal
  `0/1`, coverage `5/14` (`35.71%`) and production ready `no`.

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

## Provider execution protocol increment

- Live Agent source, control protocol, desktop runtime, headless runtime,
  capability manifest/schema, product Skills, generated Codex plugin, release
  copy and competition package use Provider execution terminology and contracts.
  The retired paid-action types, policy fields, scope and filenames have no live
  references.
- Enabling a desktop BYOK Provider plus an exact executable route is standing
  execution authority. Desktop Provider requests use automatic policy; preview,
  lifecycle events, cancellation and receipts remain observational evidence.
- Provider receipts carry route, status, artifact and timing evidence only. A
  strict regression test rejects `price`, `charge`, `credit` and `billing`
  fields. Product catalog `price` remains a source fact used to prevent model
  fabrication and is not an execution or receipt field.
- `pnpm plugin:build` rebuilt 184 bundled source modules. Focused Provider,
  control, runtime, headless, visual and candidate tests passed `111/111`;
  competition tests passed `26/26`; release/evaluator tests passed `41/41`;
  the focused Rust cancellation boundary passed `1/1`.
- Forced TypeScript, lint, Agent validation and `git diff --check` passed. The
  Design OS snapshot remains truthfully Contract `5/5`, Real Host `0/8`,
  Production Rehearsal `0/1`, coverage `5/14` and production ready `no`.

## Native operator admission and benchmark promotion (2026-08-16)

- Fresh job `commerceBurgundy006A20260816` completed the exact eleven Provider
  deliverables, seven semantic-QA receipts, one playback promotion and one
  evaluator-selected source. The admitted Run is
  `run:commerce-held-out:64dbdb68-f0a5-4b1c-844e-6a10e278d11c`; its bundle hash
  is `7ccb6d52ea960077a30759b5c4edf78573975ccf60c0384137ebfaf75cfe359a`.
- Evaluator inspection materialized all retained bytes into a new owner-only
  directory. Manual review checked the source plus six images, three localized
  descriptions, strategy closure and the complete video. The 5.038-second
  1440x1440 H.264/AAC video decoded all 150 frames; sampled frames retained the
  burgundy corduroy, cream sherpa collar, brass buttons and chest-pocket
  identity. The explicit eleven-deliverable review was accepted before the
  evaluator signed completion.
- Native admission sealed the same challenge, commitment, Run, bundle and
  evaluator attestation. The first operator publication attempt correctly
  exposed one integration defect: the passed rehearsal metric retained an own
  `diagnostic: undefined` property, so canonical JSON publication failed after
  native success. The derivation now omits that optional property entirely;
  exact recovery replayed the retained bundle without a Provider call and the
  same sealed admission published successfully.
- `admitted.json` is owner-only and hashes to
  `e4b7dec623c908cd4c26f9d5e8de29a71bbec1502c95bfab10d207bd76e774d9`.
  The restricted benchmark promoter stores only its opaque job id and evidence
  hash in `current-evidence.json`, accepts no caller path or native command, and
  re-verifies the complete retained evidence through the fixed signed native
  Host before comparing or writing snapshots. The promoter verifies the pinned
  Developer ID designated requirement at runtime; file ownership or a different
  valid signer cannot substitute benchmark authority.
- The release chain now enforces the same rule before execution: the signed
  macOS operator verifies its adjacent runner requirement, and the runner
  verifies the adjacent native Host requirement before every request.
- Durable Commerce is now deterministic `5/5`, real Host `8/8` (`13/13` total).
  Durable Design OS is contract `5/5`, real Host `8/8`, production rehearsal
  `1/1`, coverage `14/14` (`100%`), maturity `production-rehearsal`, no critical
  frontier and `productionReady=true`. Plain `pnpm benchmark:design-os`
  replays native verification and reproduces those values without network or
  model access.
- The Commerce Keychain item remains in the fixed operator service/account.
  Credential setup and native Host have the same Developer-ID designated
  requirement and the admitted Run read the credential silently after rebuild.
  A release regression now prevents those two artifacts from drifting to
  different signing identifiers; no Keychain password is stored or passed.
- Focused Commerce, Design OS, evaluator and operator Vitest passed `53/53`, the
  Keychain identity regression passed `10/10`, competition tests passed `26/26`,
  competition package validation passed, lint and strict TypeScript passed,
  Agent validation reported 20 operations, 36 MCP tools, 20 Skills and 184
  bundled modules, all four release artifacts passed strict codesign, release
  version validation passed and `git diff --check` passed.
- Full Vitest remains blocked by 19 unrelated shared-worktree failures in
  Design Profile and Game Asset tests. Production build is independently
  blocked by the missing `authorizedGameAssetRoleRequestSchema` export, and
  Cargo tests are blocked by an unrelated Game Asset `PartialEq` derive over
  `MultimodalHostReceipt`. These failures do not change the admitted Commerce
  evidence, but the repository-wide gate is not represented as green.
- The validated 17-file Node 22 competition package was archived as
  `cutout-qianwen-commerce-agent-1.0.2-20260816.zip` (61,274 bytes), SHA-256
  `d83fb06c5c41ae2e0b1c6c5bb0eeaa541f093c17465a9d708de760d77df37212`.
- This closes the internal production benchmark only. No official hidden-set
  submission or leaderboard result was produced, so this evidence does not
  establish competition SOTA.

## Qianwen 1.0.3 submission candidate (2026-08-16)

- The repository-only official public-sample evaluator reports category Top-1,
  Recall@5 and Recall@30 `11/11`, MRR `1.0`, counterfactual Top-1 `11/11`
  without source category and `11/11` from title-only facts, zero defined
  categories without evidence-backed attributes, and deterministic measurement
  localization `176/176` facts across `8/8` products. Public gold is outside
  the submitted runtime closure.
- Package contract tests pass `28/28`; lint, forced TypeScript, Agent validation,
  package validation and scoped `git diff --check` pass. These deterministic
  tests exercise a local Provider server and contribute no live or official
  competition evidence.
- `dist/agent.zip` is the exact 18-file `1.0.3` candidate: `70574` compressed
  bytes, `231406` uncompressed bytes, SHA-256
  `bc5c5846ccb1412d03f563f25910d0d23adae8c2386cf6492e4a16ffe869d28a`.
  Its standalone read-only extraction passes version, package validation and
  all `28/28` tests without repository source access.
- No package-native real DashScope Run or official hidden-set/leaderboard result
  exists for `1.0.3`; the candidate is uploadable, but SOTA remains unproven.

## Qianwen 1.0.4 locale and visual-grounding candidate (2026-08-16)

- The submitted runtime now derives one deterministic semantic source plan for
  all six image roles. Generation, targeted repair, semantic QA and the strategy
  document consume the same identity anchor, role-specific source Pointer and
  accepted-sibling/rejected-candidate reference order. The strategy closes each
  physical role, actual QA/repair result and a fixed 0.0-5.0 second storyboard.
- Residual product facts now enter the existing `qwen3.8-max` structured-plan
  call as an exact ordered fact-id translation closure. Missing, reordered,
  script-leaking, numeric-drifted, mixed-case model/size-drifted, over-80 and
  Markdown-boundary-injected responses fail before media work. Locale-native
  category and source labels retain the exact category id, original source
  value and JSON Pointer in Host-owned evidence boundaries.
- Completed-output validation now requires exact ordered locale headings,
  exact-once identity labels, bounded category ids, locale-native empty SKU and
  attribute closures, exact media-role lines and target-market script outside
  only the fixed Host evidence tokens. Arbitrary backtick/pointer bullets no
  longer hide source-market script. Exact official DashScope origin,
  `/api/v1` and `/compatible-mode/v1` bases normalize to the same pinned origin;
  every other path/origin remains rejected.
- Official public sample benchmark v3 binds source closure SHA-256
  `0fecb42b04587951778dbdcfaf7065a49032f343897f0b1148d94185161f267b`.
  Category Top-1, Recall@5 and Recall@30 are `11/11`, MRR is `1.0`, and
  source-category-free and title-only Top-1 are both `11/11`. Its PASS gate now
  rejects any regression from that complete baseline. Public accepted answers
  remain evaluator-only and package validation rejects runtime imports,
  product fixtures or accepted-answer fields.
- Deterministic measurement localization is `176/176` facts across `8/8`
  applicable products. The exact model-translation *request* inventory is
  `346/346` required residual facts across 465 unique facts with `0/11`
  incomplete products. Identity anchors are `11/11`; best-available and
  non-anchor detail source assignments are both `55/55`; all `11/11` products
  have at least three distinct supporting sources. These are offline closure
  metrics, not translation-semantic or generated-media quality scores.
- Competition package tests pass `35/35`; package validator, source syntax,
  lint, forced TypeScript, Agent validation, public-gate Vitest, Design OS
  benchmark replay and full/scoped `git diff --check` pass. Design OS replay
  remains the separate internal admitted Commerce result at `14/14` and does
  not convert the public evaluator into competition evidence.
- `dist/agent.zip` and
  `dist/cutout-qianwen-commerce-agent-1.0.4-20260816.zip` are byte-identical
  exact root-level 18-file archives: `81,841` compressed bytes, `279,263`
  uncompressed bytes, SHA-256
  `840d74ffce93e60a2603d5e02d2c94c6e25b88f516596122fd7baab8925cfa8b`.
  The previous named `1.0.3` archive remains unchanged.
- A fresh extraction reports version `1.0.4`, passes package validation and all
  `35/35` tests. After `chmod -R a-w`, the same extraction passes those checks
  through a read-only bind in cached Debian bookworm-slim Node `22.23.2`,
  `linux/amd64`, with network disabled. No dependency download, external
  Provider call, credential read or GUI control occurred during this increment.
- No package-native live DashScope material Run, official hidden-set score or
  leaderboard submission exists for `1.0.4`. The archive is a stronger
  uploadable candidate; first place and SOTA remain unproven until the platform
  runs this exact hash and returns an official result.

## Qianwen 1.0.5 submission-protocol repair (2026-08-16)

- A platform-style Prompt probe invalidated `1.0.4`: its generic output marker
  consumed `生成输出文件` before the explicit backtick-wrapped `输出目录`, and the
  entry also required an undocumented `AGENT_LOG_DIR`.
- `1.0.5` prioritizes explicit directory labels, accepts Markdown/straight/
  curly path wrappers, constrains generic markers to assignment syntax and
  makes file logging optional without adding a write root.
- The exact prior Prompt now decodes to `/home/user/ws/input` and
  `/home/user/ws/output`; the package has `36/36` contract tests, including a
  complete eleven-file run without the log variable.
- `dist/agent.zip` and its `1.0.5` named archive are byte-identical exact
  18-file packages: `82692` bytes, `282038` uncompressed bytes, SHA-256
  `db1ec1d23bc6e403bebcec3d746725dc713abbd31a614d4cfa38f82e38bf86df`.
  Fresh local and read-only/network-disabled Debian Node 22.23.2 amd64
  extractions pass version, validation and all tests.
- Lint, forced TypeScript, Agent validation, public benchmark gate and Design
  OS replay remain green at `14/14`. This packaging repair contributes no new
  benchmark score and is not official leaderboard or SOTA evidence.
