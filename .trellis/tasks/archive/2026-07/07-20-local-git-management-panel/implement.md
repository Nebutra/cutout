# Implementation Plan

## 1. Define and test the native Git domain

- Add normalized Rust types for capabilities, repository snapshots, file status,
  diffs, commits, branches, mutation plans, and receipts.
- Build temporary-repository test helpers that configure isolated identity and
  remotes without reading the developer machine's global Git state.
- Implement fixed-operation argument construction, validation, output limits,
  timeout/cancellation, redaction, and error codes before exposing commands.
- Test hostile paths, option injection, symlink/worktree boundaries, missing Git,
  stale snapshots, and credential-free serialization.

## 2. Implement bounded read operations

- Resolve only authorized workspace handles and discover the enclosing repository
  without accepting caller paths.
- Implement capability, status, text/binary diff, paginated history, commit detail,
  and branch/upstream/ahead-behind reads.
- Parse stable machine formats (`-z`, explicit format fields) rather than localized
  human output.
- Register additive Tauri commands and typed frontend service wrappers.

## 3. Implement preview/apply mutations

- Add stage, unstage, commit, create branch, switch branch, and push plan builders.
- Bind every plan to repository identity and snapshot token with TTL/single-use
  semantics.
- Require explicit approval for remote or worktree-risking effects.
- Re-read repository state after apply and return a verifiable receipt.
- Do not implement discard, force-push, delete branch, rebase/reset, or PR close.

## 4. Build the project Git dock

- Add Git to `WorkspaceRail` and the existing mutually exclusive dock state.
- Create Changes, History, Branches, and Pull Requests views with shared loading,
  empty, refreshing, and failure treatments.
- Keep lists and contextual actions in the dock; route selected review content to a
  dedicated main-workspace review projection.
- Add keyboard navigation, focus restoration, accessible names, responsive widths,
  and persistence only for harmless UI preferences.

## 5. Complete local workflows

- Changes: grouped status, staged selection, diff selection, commit composition,
  stage/unstage preview, commit receipt, and refresh.
- History: incremental log, commit metadata/files, and per-file historical diff.
- Branches: local/remote grouping, create/switch previews, dirty-state blockers, and
  ahead/behind summary.
- Push: explicit destination preview, upstream behavior, confirmation, progress,
  cancellation boundary, and verified post-push state.

## 6. Add truthful Pull Request capability

- Render capability-required state when no authenticated GitHub host exists.
- Reuse the existing Integration route for connection guidance without inventing
  OAuth or session state.
- If a verified host is present, add typed list/detail/check/review reads and a
  previewed merge operation bound to expected head SHA.
- Keep GitHub host work separately testable from local Git.

## 7. Validate product and contracts

- Run focused Rust, service, component, and Playwright tests during iteration.
- Run `pnpm lint`, TypeScript validation, production build, and `cargo test`.
- Run `pnpm agent:validate`; public Agent contract should remain unchanged in this
  slice. If implementation proves otherwise, synchronize CLI, MCP, protocol,
  manifest, docs, and Skills before merging.
- Inspect light/dark and narrow/desktop layouts with the app running; verify no
  overlap with collapsed/expanded Agent and Files docks.

## Delivery Slices

1. Read-only native domain plus Changes/History UI.
2. Branch reads and local preview/apply mutations.
3. Commit/push flow and robust receipts.
4. GitHub host-aware Pull Requests view and merge, only when the real host contract
   is available.

Each slice must leave existing project workflows usable and independently testable.

## Closeout status (2026-07-20)

- Implemented local status, bounded diffs, paginated history, commit changed-file
  review, historical per-file diffs, branch comparison, staging, unstaging,
  commit/create/switch opaque preview plans, verified receipts, and push preview.
- GitHub pull requests remain truthfully unavailable without a verified host.
  Live PR list/detail/merge is a later slice once that host contract exists.
- Agent-facing Git context remains a later contract-review slice; no public Agent,
  CLI, or MCP Git operation was added.
- `tests/visual/git-workspace.spec.ts` captures desktop/narrow layout assertions,
  but is skipped because the current browser fixture cannot enter project workspace
  while its AI-native polling mock is active. Component interaction coverage remains
  active in `GitWorkspaceDock.test.tsx`; enable the visual spec when a project-state
  fixture that does not invoke generation is available.
