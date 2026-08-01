# Implementation plan

## 1. Authoritative delivery evidence

- [x] Add a pure sanitized projection from validated prototype suite artifacts.
- [x] Re-derive and digest `DESIGN.md`, CSS variables, Tailwind theme, token
      JSON, and Design IR token projections.
- [x] Digest route graph, page media, manifest, exact bindings, pack identity,
      provenance, and required review document without exposing raw private
      payloads.
- [x] Add unit tests for complete evidence plus every fail-closed boundary.

Validation:

```bash
pnpm vitest run src/prototype/delivery-evidence.test.ts
```

## 2. Honest production progress

- [x] Add a pure monotonic observation/projector module with `unavailable`,
      `collecting`, and bounded-range estimate states.
- [x] Promote suite progress recording out of the packaged-only branch while
      keeping packaged DOM attributes gated to E2E builds.
- [x] Show page/resource completion and an honest range on suite comparison
      cards; preserve failed and retry-preserved frontiers.
- [x] Add unit and rendered regressions for monotonicity, state coverage,
      retries, and absence of false precision.

Validation:

```bash
pnpm vitest run src/prototype/delivery-progress.test.ts src/components/workspace/prototype-all-routes.e2e.test.tsx
```

## 3. Scheduling and failure isolation

- [x] Generate the user-selected Design System direction first, then continue
      every sibling to final fidelity.
- [x] Remove packaged-only sibling cancellation after a suite failure.
- [x] Extend the rendered retry regression so an independent later sibling
      completes before Retry and only the failed frontier is replayed.
- [x] Keep the compiled paid-call budget and existing concurrency ceilings
      unchanged.

Validation:

```bash
pnpm vitest run src/components/workspace/prototype-all-routes.e2e.test.tsx src/prototype/image-request-budget.test.ts
```

## 4. Packaged evidence and terminal closure

- [x] Expose sanitized per-candidate delivery evidence to the packaged driver.
- [x] Make the TypeScript driver validate and submit the complete evidence.
- [x] Strengthen the Rust protocol validator for all Design System, topology,
      resource binding, provenance, review, and digest fields.
- [x] Make terminal progress sticky and close `progress.json` with the same
      terminal status and merged phases as `result.json`.
- [x] Add TypeScript and Rust regressions for malformed evidence, missing
      candidate proof, terminal parity, and late checkpoints.

Validation:

```bash
pnpm vitest run src/packaged-e2e/runner.test.ts src/prototype/delivery-evidence.test.ts
cargo test --manifest-path src-tauri/Cargo.toml packaged_e2e
```

## 5. Quality gates

- [x] Run Agent contract validation because the work touches the Agent-owned
      prototype surface.
- [x] Run lint, TypeScript/Vite build, focused and full Vitest, Rust tests,
      browser gates, and whitespace checks.
- [x] Review generated UI at desktop and mobile sizes for overflow, stable card
      dimensions, and readable progress states.

Validation:

```bash
pnpm agent:validate
pnpm lint
pnpm build
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml
pnpm test:visual
git diff --check
```

## 6. Real packaged outcome gate

- [x] Build the packaged-E2E app and run a fresh background VM journey using
      the real local credential discovery and configured image Provider.
- [x] Require every promised candidate to finish with independent delivery
      evidence and matching terminal result/progress status.
- [x] Record time to Design Systems, first selected complete suite, every later
      suite, total duration, paid call count, concurrency, failures, retries,
      and evidence digests in `research/real-packaged-run-041.md`.
- [x] Reject the release if calls exceed the compiled baseline, any candidate
      lacks proof, or Retry replays settled work.

## 7. Integrate and release

- [ ] Update the executable prototype-generation spec with the new delivery,
      progress, scheduling, and terminal-state contracts.
- [ ] Commit the clean worktree, merge directly to `main`, push, publish the
      next signed/notarized updater release, uninstall the previous local app,
      install the new app, and verify its version/signature/notarization.
- [ ] Preserve the dirty primary worktree and do not include unrelated files.

Rollback point: do not merge or publish until Step 6 proves the full real
outcome. A packaged failure remains a release blocker, not a test waiver.
