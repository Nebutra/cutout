# Productize general Commerce production

## Goal

Make Cutout's Commerce surface a usable product workflow, not only a competition operator. A designer or builder can import one ordinary product record plus local product references, run the configured first-party DashScope Provider, review the complete localized material set, and export retained deliverables with native receipts and QA evidence.

## Background

- The Commerce profile already defines an eleven-role Outcome DAG: three localized descriptions (`en-US`, `ko-KR`, `pt-BR`), one main image, five detail images, one product video, and one strategy document.
- `src/commerce-profile/production-runner.ts` executes those roles through verified native DashScope routes, but its public entry point currently requires an evaluator challenge, held-out commitment, remote competition source ingestion, and evaluator admission.
- `src/components/design-os-workbench/CommerceProductionPanel.tsx` exposes only that Benchmark workflow.
- `multimodalHostContextSchema.heldOutCommitmentHash` is optional. Ordinary Provider receipts can therefore remain native and authenticated without pretending to carry evaluator authority.

## Requirements

### R1. Separate product and benchmark authority

- Add a default `Project` mode for ordinary Commerce production.
- Preserve the existing `Benchmark` mode, evaluator package, commitment, completion request, attestation, and `14/14` admission behavior unchanged.
- Project results must not contain an evaluator challenge, held-out commitment, completion request, benchmark score, `productionReady`, or `14/14` claim.

### R2. Bounded ordinary inputs

- Accept exactly one ordinary direct-product or `ret.result.result` JSON record.
- Accept exactly one category catalog JSON and one attribute catalog JSON using the existing bounded catalog parsers.
- Accept one to three local PNG, JPEG, or WebP product reference images, each no larger than 10 MiB.
- Local references replace the product record's image descriptors for this run, with the first image acting as the immutable identity anchor.
- Reject malformed JSON, unsafe filenames, unsupported or undecodable images, duplicate source hashes, oversize inputs, and missing required files before Provider execution.

### R3. Shared real execution

- Both Project and Benchmark modes must use one shared Commerce execution function for copy, image, semantic QA, video, and strategy production.
- Keep the existing verified models and native Provider routes.
- Project Provider receipts must omit `heldOutCommitmentHash`; Benchmark receipts must preserve their exact commitment binding.
- Preserve content-addressed source and output identities, the existing Outcome DAG, identity/creative locks, native receipt verification, media QA, video playback promotion, and deterministic policy validation.

### R4. Observable project runs

- Emit ordered progress for all eleven semantic roles.
- Retain completed deliverables in the UI if a later role fails or the run is cancelled.
- Present an actionable error without converting a partial run into a completed result.
- A completed result must expose run identity, timing, Provider identity, source hashes, eleven ordered deliverables, export-safe filenames, retained bytes, native receipts, QA state, and diagnostics.

### R5. Review and export

- Preview localized documents, generated images, video, and strategy in the Commerce panel.
- Allow downloading each completed deliverable using its correct media type and filename.
- Allow exporting all completed deliverables plus a JSON manifest from one explicit command.
- Exported files are derived from retained, content-verified bytes; the UI must not reconstruct or relabel outputs as benchmark evidence.

### R6. Product surface

- Use a clear `Project | Benchmark` segmented control with Project selected by default.
- Project setup exposes product, category, attribute, local reference, and Provider controls without evaluator terminology.
- Show stable input, progress, result, QA, failure, cancel, reset, and retry states without nested decorative cards or layout shifts.

## Constraints

- Preserve `.cutout` Design IR and provenance authority; this feature does not add an arbitrary project filesystem writer.
- Do not add web fetching, arbitrary absolute paths, generic Provider execution, cloud collaboration, or live marketplace sync.
- Do not expose credentials or add another credential store.
- Do not claim mocks, fixtures, contract tests, or project runs as Benchmark/SOTA evidence.
- Keep CLI/MCP surfaces unchanged in this MVP; the Commerce Project workflow is desktop-only and must be stated truthfully in the capability manifest/spec.

## Acceptance Criteria

- [ ] AC1: Given valid ordinary product/catalog JSON files, one to three valid local product images, and an enabled keyed first-party DashScope Provider, Project mode executes the existing eleven-role Commerce DAG.
- [ ] AC2: Project receipts are natively verified, bind exact run/role/node/reference/lock context, and contain no held-out commitment field.
- [ ] AC3: The completed Project result validates against a strict schema and includes exactly eleven ordered, content-addressed, exportable deliverables.
- [ ] AC4: Seven media deliverables expose passing semantic QA evidence; video also exposes verified playback promotion.
- [ ] AC5: UI progress updates per role, cancellation is available, failures are visible, and already completed outputs remain reviewable/downloadable.
- [ ] AC6: Project is the default Commerce tab and contains no challenge, admission, benchmark score, `productionReady`, or `14/14` claim.
- [ ] AC7: Benchmark mode retains the existing held-out evaluator flow and its tests.
- [ ] AC8: Focused unit/UI tests, lint, forced TypeScript, `pnpm agent:validate`, Design OS benchmark, and `git diff --check` pass.

## Out of Scope

- Batch SKU campaigns, arbitrary locales/channels, marketplace publishing, remote URL ingestion, template marketplaces, editing generated media, automatic repair loops, background persistence across app restarts, and CLI/MCP execution.
