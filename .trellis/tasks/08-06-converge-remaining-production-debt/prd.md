# Converge remaining production debt

## Goal

Make the current asset-production product honestly releasable: every supported
image route has an exact executable transport, a real packaged background run
proves complete intent-driven delivery, removable compatibility code is deleted,
and the resulting version is published and installed. Coding delivery is not part
of this task.

## Background

- Local `main` at `ca672c9` contains seven commits absent from `github/main`.
  The latest public release and `/Applications/Cutout.app` are both `0.1.19`.
- Deterministic gates pass, but the post-convergence code has no complete live
  packaged proof from planning through Design Systems, route pages, reusable
  assets/slices and resource packs. Public desktop turn execution therefore
  remains `capability-required`.
- Model capability and Provider transport are different facts. OpenAI-shaped
  generation/edit transports exist; Google generation exists but generic edit
  dispatch is missing; native DashScope/Qwen generation/edit is missing. xAI's
  documented image generation and JSON edit endpoints require a distinct edit
  transport because OpenAI multipart is explicitly unsupported.
- Generic image transport support remains broader than product-task fitness.
  Full UI/UX prototype production is restricted to reviewed `gpt-image-2` and
  exact `qwen-image-3.0` routes; older/general edit models remain usable for
  ordinary image editing but never become a silent prototype-quality fallback.
  User intent and domain best practice determine Design System, page and
  reusable-asset counts.
- GitHub reports seven JavaScript alerts already resolved by the local lockfile
  and one `glib@0.18.5` advisory in the all-target Linux GTK/WebKit dependency
  family. The latter cannot be fixed by forcing one incompatible crate version.
- The DevUX operation count and Motion IR product matrix are stale. A duplicate
  governance report schema and primary-platform updater metadata fallback are
  removable compatibility surfaces.

## Requirements

### R1. Exact image transport capability

- Resolve support as the intersection of an enabled exact provider/model route,
  observed or verified model capability evidence, and a closed executable image
  transport strategy.
- Keep transport strategies explicit. Do not introduce `any-reviewed-adapter`,
  provider-name catch-alls, or model-name authorization.
- Implement xAI's documented JSON generation/edit contracts for exact
  authenticated catalog models. Do not represent Imagine Image 2.0 as API-ready
  while xAI says access is coming soon and publishes no API model id.
- Wire Google reference-conditioned editing through its existing multimodal
  GenerateContent image-output path, preserving every source/reference image.
- Implement the documented native DashScope image generation and editing
  transports, including synchronous/asynchronous responses, bounded polling,
  cancellation, retryable status handling, response size limits and reviewed
  result-download origins. Do not route Qwen image APIs through compatible-mode
  text endpoints.
- Preserve exact provider model ids. Recommendations may rank known high-fidelity
  routes but cannot alter the supported set.
- Evaluate prototype-production fitness after generic transport support. Reject
  a prototype before paid work when no reviewed `gpt-image-2`,
  `qwen-image-3.0`, or `qwen-image-3.0-pro` route owns the required operation;
  do not fall back to GPT Image 1/1.5 or another generic edit route.
- An edit request without a matching edit transport must fail before approval or
  paid execution and must never fall back to unconditioned generation.

### R2. Complete real asset-production proof

- Run a signed or release-equivalent packaged desktop build in the background,
  without stealing the foreground, using automatic local credential discovery
  and a real image Provider. Do not inject a credential into WebView state or
  replace the product orchestration with direct API calls.
- Start from a natural-language creative intent. Let the Agent choose Design
  System variants, route topology, page count and reusable non-UI asset count
  from the business scenario; no test constant may prescribe those counts.
- The run succeeds only when the selected Design System, every planned route,
  every planned accepted material/slice and every resource pack exist with
  content hashes and provenance. Planned and actual provider calls must match.
- Persist a sanitized evidence bundle containing the input intent, Agent plan,
  per-stage timing, retry/cancellation evidence, output manifest, dimensions,
  hashes and screenshots/contact sheets. It must contain no key, Authorization
  header, credential value or unreviewed local path.
- Treat an incomplete, placeholder, duplicate, corrupt or fidelity-failing output
  as a failed run; fix the owning orchestration/transport/state bug and repeat.

### R3. Remove current drift and compatibility debt

- Synchronize the documented MCP/CLI operation count with the validated Agent
  contract and correct the false `No Motion IR` statement.
- Delete the duplicate `legacyFindingSchema`/governance report contract in favor
  of the canonical standards-governance contract and update imports/tests.
- Remove unused single-primary updater metadata inputs/outputs while preserving
  the active multi-platform Tauri updater manifest consumed by `0.1.19` clients.
  Active forward-update compatibility is a release contract, not legacy debt.
- Remove no-longer-referenced compatibility code discovered while implementing
  these changes. Do not add migrations or fallback branches for unused internal
  schemas.
- Keep `.cutout` Design IR and provenance authoritative; generated exports remain
  derived artifacts and all apply paths retain preview/approval boundaries.

### R4. Security and quality closure

- Push the patched JavaScript dependency graph so GitHub no longer reports the
  seven locally resolved `undici`/`postcss` alerts.
- Add a reproducible Rust advisory check. The documented upstream-only `glib`
  advisory may remain visible until the whole Tauri/Wry/WebKitGTK ABI family can
  move; do not hide it or force an incompatible partial upgrade.
- Pass lint, type-check, unit/integration tests, production build, Rust tests and
  checks, Playwright desktop/mobile suites, i18n, release contracts,
  `pnpm agent:validate`, audits and `git diff --check`.
- Run available macOS checks locally and require GitHub Linux/Windows/macOS
  matrices before publication.

### R5. Publish and install

- Prepare the next patch version with synchronized package, Tauri, Cargo, Agent
  capability and Codex plugin versions, localized release notes and changelog.
- Push reviewed commits to GitHub `main`, create the matching protected tag, wait
  for the complete signed/notarized four-platform release, verify updater
  metadata/signatures/attestations, and publish no partial release.
- Replace the installed local Cutout only with the verified new build and prove
  its displayed bundle version and launch health.

## Acceptance Criteria

- [ ] AC1: Google and native DashScope image routes pass generation/edit contract,
      cancellation, retry, malformed-response and secret-boundary tests.
- [ ] AC2: Route assessment never grants support from recommendation/model naming
      alone and never silently degrades an edit to unconditioned generation.
- [ ] AC3: One real background packaged run completes its Agent-authored plan and
      produces a sanitized, hash-verifiable evidence bundle with real image bytes.
- [ ] AC4: No page, Design System or reusable-asset count is hardcoded by the E2E;
      completeness is checked against the persisted plan.
- [ ] AC5: Documentation matches 20 Agent operations and implemented Motion IR.
- [ ] AC6: Duplicate governance and updater compatibility surfaces are removed
      without breaking canonical governance or `0.1.19` forward OTA consumption.
- [ ] AC7: Local and required GitHub quality/security gates pass; only the exact
      documented upstream `glib` advisory may remain open.
- [ ] AC8: A new immutable public release contains every required platform,
      signature, notarization, checksum, SBOM, provenance and updater artifact.
- [ ] AC9: `/Applications/Cutout.app` runs the verified new version.

## Out Of Scope

- Coding delivery or generated HTML.
- Cloud collaboration, hosted Provider execution, video processing, web search,
  live Figma sync, new OAuth hosts or marketplace/store approval.
- Building a full creative-board editor, component-authoring system or motion
  timeline in this convergence task.
- Hiding an unsupported capability, security advisory or incomplete run behind a
  success state.

## Release Constraint

Publication is authorized only after all code and evidence gates pass. Missing
protected release credentials, GitHub environment approval, upstream availability
or a complete native matrix is a truthful release blocker, not permission to
weaken the workflow.
