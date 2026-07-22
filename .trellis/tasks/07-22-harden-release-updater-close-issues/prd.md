# Harden release updater and close GitHub issues

## Goal

Make Cutout's security reporting, release governance, desktop updater, version
contract, and public distribution behavior truthful and fail-closed, then close
all currently open GitHub issues with verifiable evidence.

## Background

- GitHub currently has one open issue: `Nebutra/cutout#12`.
- Issue #12 requests a private vulnerability channel and lists eight security
  finding classes covering provider transport, desktop filesystem commands,
  MCP root binding, approvals, starter generation, and repository scanning.
- The published updater uses signed artifacts and notarized macOS bundles, but
  the review found unprotected release settings/tags, runtime replacement of
  the updater trust root, ineffective rollout/rollback attachments, incomplete
  release quality gates, divergent remotes, retry-state drift, unsigned Windows
  installers, unconditional Beta UI, and duplicated product version literals.
- The working tree contains unrelated concurrent changes. This task must not
  revert, stage, or overwrite them.

## Requirements

### Security reporting and issue closure

- Enable GitHub private vulnerability reporting and add a repository
  `SECURITY.md` that defines supported versions, private reporting routes,
  response expectations, and a prohibition on public exploit details.
- Audit every finding class disclosed in issue #12 against current HEAD. Fix
  every present or partial boundary, add regression coverage, and keep CLI,
  MCP, protocol, capability manifest, plugin runtime, and docs synchronized.
- Comment on issue #12 with the private reporting route and remediation status,
  then close it without asking the reporter to disclose exploit details in
  public.

### Release and GitHub governance

- Protect the `release` environment from arbitrary workflow refs and disable
  administrator bypass. Require explicit deployment approval where the current
  repository membership permits it; do not invent an independent reviewer.
- Add active repository rules that protect `main` and prevent release-tag
  deletion or movement. Release publication must consume an existing reviewed
  `v<semver>` tag and must never rewrite source or replace published assets.
- Make GitHub the single release authority. Document the private `origin` as a
  downstream mirror and provide a deterministic divergence check before tags
  are created or pushed.
- Pin release workflow actions and toolchains to reviewed immutable versions.
  Add artifact attestation where GitHub supports it.
- A release must require the complete repository quality gate before native
  packaging. No direct tag path may bypass lint, TypeScript, tests, Rust checks,
  Agent contract validation, build gates, or required smoke tests.

### Updater runtime and product behavior

- Production builds must use a compile-time updater public key, endpoints, and
  host allowlist. Process environment overrides are allowed only in debug/test.
- Remove staged-rollout and automatic-rollback inputs, artifacts, tests, and
  claims until Cutout has a signed mutable control plane that actually enforces
  them. Standard signed forward updates remain supported.
- Make updater cancellation, failure, retry, download, install, and relaunch
  phases consistent across Rust and TypeScript. A visible retry must be accepted
  by the native state machine.
- Expose Beta only when a valid Beta endpoint is compiled. Missing Beta support
  is a capability state, not a selectable broken option.
- Use one package-version authority for UI, CLI, MCP, capability/plugin output,
  Tauri, and Cargo validation; release validation must catch every drift surface.

### Platform distribution

- macOS remains gated on Developer ID signing, notarization, stapling, and
  verification.
- Public Windows installers must be Authenticode signed. The workflow must fail
  closed or omit Windows publication when the required certificate material is
  unavailable; updater signatures alone must not be described as Authenticode.
- Do not claim automatic rollback, staged rollout, Beta availability, signed
  Windows distribution, or independent release review without evidence.

## Acceptance Criteria

- [ ] GitHub private vulnerability reporting is enabled and `SECURITY.md` is
  present.
- [ ] Every issue #12 finding class has a recorded fixed/not-applicable outcome
  backed by code and tests; `pnpm agent:validate` passes after Agent-surface
  changes.
- [ ] Issue #12 is closed with a public comment pointing to the private channel;
  `gh issue list --state open` returns no issues.
- [ ] The release environment rejects unapproved refs and administrator bypass,
  and active rules protect `main` plus `refs/tags/v*`.
- [ ] Release CI has immutable action/toolchain references, a complete quality
  dependency, immutable publication, and artifact attestations where supported.
- [ ] Production updater configuration cannot be replaced by process env vars;
  focused Rust tests prove debug and release behavior.
- [ ] Rollout/rollback controls and claims are removed, or an actually enforced
  signed control plane exists. This task defaults to removal.
- [ ] Cancel/retry and failure/retry work in focused frontend and Rust tests.
- [ ] Beta controls are hidden/disabled unless capability reports a configured
  Beta endpoint.
- [ ] All product version surfaces derive from or validate against one authority.
- [ ] Windows publication is Authenticode-gated and cannot silently ship an
  unsigned public installer.
- [ ] Focused tests, full lint/type/test/build/Rust/Agent gates, workflow contract
  tests, and `git diff --check` pass without reverting unrelated changes.

## Constraints

- `.cutout` Design IR and provenance remain authoritative; generated exports are
  not edited as source.
- Never weaken approval, filesystem, provider-host, or secret boundaries.
- GitHub settings changes must be read back after mutation and be reversible.
- A missing Windows certificate or independent human reviewer is an external
  prerequisite, not permission to report a false success.

## Out Of Scope

- Building a hosted update service or cloud collaboration backend.
- Publishing a new Cutout version as part of this hardening task.
- Emptying Trash or modifying the verified local `0.1.3` installation.
