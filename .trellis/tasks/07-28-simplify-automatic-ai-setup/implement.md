# Implementation Plan

- [x] Add and test a pure AI setup projection over Providers, verification
  receipts, bindings, and discovery state.
- [x] Make provider verification receipts observable within the current window.
- [x] Replace the current AI section hierarchy with one outcome overview and a
  single advanced management disclosure.
- [x] Remove the local Agent inventory UI component/tests while retaining its
  service and native contract.
- [x] Add focused component/projection tests for ready, unverified, capability
  gap, importable discovery, unavailable, and progressive-disclosure states.
- [x] Synchronize locale catalogs and update the BYOK Settings spec.
- [x] Run focused tests, `pnpm agent:validate`, lint, TypeScript, production
  build, and `git diff --check`.

## Rollback Points

- The change must not modify Rust, Tauri permissions, provider discovery IPC,
  or the Agent capability manifest.
- If readiness cannot be derived truthfully, retain an action-required state;
  never infer verification from Provider existence alone.
