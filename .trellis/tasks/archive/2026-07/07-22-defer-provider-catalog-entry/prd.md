# Defer provider catalog from frontend entry

## Goal

Restore the production frontend bundle gate so a compliant native Cutout app
can be built and installed without weakening provider or release policy.

## Background

- `createLocalRegistry()` intentionally defers the AI SDK and provider adapters.
- `createLocalProviderService()` statically imports the provider registry only
  to resolve a first-party default base URL during an explicit connection test.
- That static import places Anthropic and Google catalog endpoint strings in the
  frontend entry, causing `scripts/check-frontend-bundle.mjs` to fail.

## Requirements

- Remove the provider registry from provider-service initialization and the
  frontend entry chunk.
- Load provider catalog metadata only when `ProviderService.test()` needs a
  first-party default base URL.
- Preserve configured/custom base URL behavior, wire-protocol selection, Rust
  proxy invocation, model-catalog parsing, and non-billable connection checks.
- Do not weaken or bypass the frontend bundle gate.

## Acceptance Criteria

- [ ] `createLocalProviderService()` can initialize without loading the provider
  catalog implementation.
- [ ] First-party connection checks still resolve their catalog default URL.
- [ ] Custom/configured endpoint checks do not require the provider catalog.
- [ ] Focused provider tests pass.
- [ ] `pnpm build` passes the frontend bundle gate.
- [ ] An Apple Silicon Tauri release `.app` builds successfully.
- [ ] The old `/Applications/Cutout.app` is replaced only after the new bundle
  has been built and inspected.

## Out of Scope

- Provider protocol, endpoint, authentication, or catalog schema changes.
- Weakening release or security checks.
- Distribution signing, notarization, or updater publication.
