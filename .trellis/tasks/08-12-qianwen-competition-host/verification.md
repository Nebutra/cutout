# Verification

## Historical 1.0.2 Host Rehearsal

- Host version: `1.0.2`.
- Fresh held-out DashScope Run 6 completed in `944276ms` with exactly eleven published
  outputs and internal A1-A7 closure.
- Offline completed-output digest:
  `e3ccaf41326ead168c732b3455c7768f8816f135fc61c10184921bbac47761b9`.
- Six of six images decoded at `1024 x 1024`; manual review preserved the
  supplied purple SKU, loose silhouette, collar, button, cuff, material, and
  sibling identity across main/detail roles.
- `product_video.mp4` decoded end to end as H.264/yuv420p, `1440 x 1440`,
  30fps, 150 frames, `5039ms`, with AAC audio. Five timeline samples preserved
  product and wearer identity without color, construction, or temporal drift.
- The three localized documents bind exact physical filenames to the shared
  post-QA semantic-role contract. Free-form model descriptions of future media
  are rejected.

## Negative Controls

- A pre-fix real run passed physical closure but its model-authored media text
  described scenes absent from delivered bytes. The current validator rejects
  that output, and the Host now projects media inventory only after QA.
- A prior rehearsal lost transport during a Provider image POST. The Host
  retained accepted siblings, published no official output, persisted
  `submit-intent`, and refused a cross-process retry that could duplicate spend.

## Quality Gates

- Package tests: 26/26 on macOS and Debian 12 amd64 / Node 22.23.2.
- Package validator: 17 files, dependency-free runtime, canonical projection
  hashes current.
- Final ZIP: `qianwen-commerce-agent-1.0.2.zip`, `61652` compressed bytes,
  `203831` uncompressed file bytes, SHA-256
  `21de8f008bf4fe48f3c848d2ec7cb552c3deb2b8e5b36307e49723df8b65a4de`.
- The ZIP itself passed `--version`, 26/26 tests, and package validation from a
  read-only mount in Debian 12 amd64 / Node 22.23.2 with networking disabled.
- Commerce/Design OS/Multimodal tests: 70/70.
- `pnpm lint`, strict TypeScript, `pnpm build`, `cargo check`,
  `cargo fmt --check`, `pnpm agent:validate`, and `git diff --check` passed.

## Benchmark Boundary

The competition Host rehearsal proves this package, not the public Cutout
headless surface. It has no canonical signed `.cutout` source-ingest and
Provider receipt bundle, so it is not imported as a trusted Commerce production
rehearsal. At the time of this historical package, Design OS therefore remained
`5/14`, maturity `contract`, and `productionReady=false`. A later independently
admitted Cutout `0.1.21` rehearsal now owns the current internal `14/14`
snapshot; it does not retroactively turn the `1.0.2` package into that evidence.

## 1.0.3 Candidate Verification

- The runtime category retriever uses catalog lineage plus garment, audience,
  usage-context and plus-size semantics. It contains no public product ids or
  accepted category answers. Attribute projection now prefers exact source
  keys and keeps material-function, skirt-length and pants-length concepts
  distinct instead of manufacturing catalog evidence.
- The repository-only public benchmark passed on the reviewed official sample:
  category Top-1 `11/11`, Recall@5 `11/11`, Recall@30 `11/11`, MRR `1.0`;
  Top-1 remains `11/11` after removing source category and also from title-only
  facts. Measurement localization covers `176/176` supported facts across
  `8/8` products. Three top categories have zero backed attributes because the
  supplied catalog has zero definitions for those categories; no defined
  category is left without evidence.
- Package contract tests pass `28/28`. They use a local deterministic Provider
  server to exercise orchestration and rejection paths and contribute no live
  Provider, hidden-set, production-readiness or SOTA evidence. The package
  validator reports 18 files and passes both in the repository checkout and
  from a standalone extracted copy.
- Fresh submission candidate `dist/agent.zip` contains the exact 18-file root
  closure, `231406` uncompressed bytes and `70574` compressed bytes. SHA-256 is
  `bc5c5846ccb1412d03f563f25910d0d23adae8c2386cf6492e4a16ffe869d28a`.
  A standalone read-only extraction reported version `1.0.3`, passed package
  validation without repository source access and passed all `28/28` tests.
  The versioned archive
  `dist/cutout-qianwen-commerce-agent-1.0.3-20260816.zip` is byte-identical.
- No package-native real DashScope Run has been executed for `1.0.3`, and no
  official hidden-set/leaderboard result exists. The historical `1.0.2`
  rehearsal cannot be relabeled as `1.0.3` evidence, so this is a validated
  upload candidate rather than proof of SOTA.

## 1.0.5 Submission Entrypoint Repair (2026-08-16)

- The prior `1.0.4` ZIP failed the platform-style multiline Chinese Prompt:
  generic `输出` matched `生成输出文件` before the explicit `输出目录` label,
  and Markdown backticks were not decoded as path wrappers. The extracted
  process exited `1` with `invalid-prompt`, so `1.0.4` is not upload-ready.
- `1.0.5` gives explicit input/output directory labels priority, supports
  backticks plus straight/curly quotes, and requires assignment syntax for
  generic markers. The exact previously failing Prompt now resolves to
  `/home/user/ws/input` and `/home/user/ws/output`.
- `AGENT_LOG_DIR` is now optional because the submission contract does not
  promise it. Absence selects a no-file logger and adds no output; an explicitly
  supplied value remains bounded, absolute, non-symlinked and non-overlapping.
- Package contract tests pass `36/36`, including a complete eleven-file run
  with the platform Prompt and no log variable. The package validator reports
  the exact 18-file, dependency-free Node 22 closure at `282038` uncompressed
  bytes. Deterministic local Provider fixtures prove contract behavior only.
- `dist/agent.zip` and
  `dist/cutout-qianwen-commerce-agent-1.0.5-20260816.zip` are byte-identical,
  `82692` bytes, with SHA-256
  `db1ec1d23bc6e403bebcec3d746725dc713abbd31a614d4cfa38f82e38bf86df`.
- A fresh extraction reports `1.0.5`, passes all `36/36` tests and package
  validation, then repeats those checks in read-only, network-disabled Debian
  bookworm-slim Node `22.23.2`, `linux/amd64`.
- Lint, forced TypeScript, Agent validation, the public benchmark gate and the
  Design OS `14/14` replay pass. No real `1.0.5` DashScope material Run,
  official hidden-set score or leaderboard result was produced; upload
  compliance is verified, while SOTA remains an external result.

## Bug Analysis: Platform Prompt Was Not An Executable Fixture

### 1. Root Cause Category

- **Primary: D - Test Coverage Gap.** Tests covered simplified English and
  Chinese marker sentences, not the full platform paragraph, path wrappers and
  label precedence in one process-level case.
- **Secondary: E/B - Implicit Assumption and Cross-Layer Contract.** The entry
  assumed an undocumented log environment and treated natural-language marker
  fragments as if they were structured labels.

### 2. Why The Earlier Checks Missed It

1. ZIP validation proved file shape, version and dependencies, but did not run
   the platform Prompt verbatim.
2. The Chinese unit case contained no backticks and no earlier `输出文件` prose,
   so the overly broad regular expression still passed.
3. Every production-path fixture supplied `AGENT_LOG_DIR`, masking the platform
   environment dependency.

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific action | Status |
| --- | --- | --- | --- |
| P0 | Test coverage | Preserve the exact multiline platform Prompt and run it through `main` without a log variable | DONE |
| P0 | Architecture | Prioritize explicit labels and require link syntax for generic markers | DONE |
| P0 | Runtime | Make non-contract logging optional without creating another write root | DONE |
| P1 | Release gate | Re-run the extracted ZIP in read-only, network-disabled Debian Node 22 | DONE |
| P1 | Documentation | Capture the entrypoint signature, env contract and error matrix in the Commerce spec | DONE |

### 4. Systematic Expansion

- Future submission Hosts must test the organizer's complete invocation text,
  not a semantically similar paraphrase.
- Package structure, algorithm benchmark and startup protocol are independent
  gates; passing one cannot stand in for another.
- Optional operational diagnostics must not become undocumented launch
  dependencies or expand the evaluator-approved filesystem boundary.

### 5. Knowledge Capture

- [x] Added the submission entrypoint scenario to the Commerce code-spec.
- [x] Added process-level and parser-level regressions to the shipped package.
- [x] Recorded the invalidated `1.0.4` and replacement `1.0.5` archive hashes.
