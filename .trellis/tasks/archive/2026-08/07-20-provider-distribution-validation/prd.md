# Provider discovery distribution validation

## Goal

Prove the completed Provider discovery implementation in the operating-system and
packaged-desktop environments that unit and component tests cannot faithfully model.

## Scope split

Parent task `07-20-smart-provider-discovery` owns implementation, typed contracts,
security boundaries, UI state, and automated tests. This child owns only the three
environment/distribution validation gates below. Creating this task does not claim
that any gate has passed.

## Requirements

### Real Keychain adapters

- Seed exact current `com.nebutra.cutout / provider:{id}` and legacy
  `com.leishi.cutout / provider:{id}` records with disposable test credentials.
- Verify discovery performs presence/attribute lookup without generic enumeration or
  eager secret disclosure.
- Verify explicit import copies the selected legacy/current credential into the
  current Cutout namespace without deleting the source.
- Remove every disposable fixture after validation.

### Packaged desktop flow

- Exercise discover -> preview -> check -> model select -> save -> generate in a
  packaged desktop build against controlled Responses and Chat Completions fixtures.
- Inspect WebView state, IPC payloads and application logs to prove secrets never
  cross or appear in diagnostic output.
- Cover success, unauthorized, unreachable, unsupported catalog and malformed catalog
  outcomes with their distinct user-visible error state.

### Generated contract validation

- Wait until concurrent owners of headless, design-governance and source-scanner
  sources have settled.
- Rebuild generated Codex plugin runtime artifacts from their authoritative sources.
- Run the complete Agent validation without weakening drift checks or excluding
  changed sources.

## Acceptance criteria

- [ ] Current and legacy exact Keychain fixtures are discovered and explicitly
      imported with no enumeration, source deletion or secret exposure.
- [ ] A packaged desktop build completes both Responses and Chat Completions provider
      flows and records sanitized evidence for success and catalog error cases.
- [ ] WebView, IPC and application-log inspection finds no raw credential value.
- [ ] `pnpm agent:validate` passes after authoritative plugin artifacts are rebuilt.

## Out of scope

- Adding new Provider discovery sources or private credential-store heuristics.
- Changing the parent implementation merely to bypass environmental setup.
- Claiming production provider availability from mocked network checks alone.
