# Controlled Agent session delegation

## Goal

Build a truthful, staged path toward using locally authenticated Agent runtimes
without copying credentials. This release may harden the host and expose an
explicit Codex capability/authentication probe, but it must not make a Codex or
Claude model request until the runtime's read and tool authority is enforceably
confined.

## Background

- Cutout inventories reviewed local coding Agents and imports API keys for
  exact supported schemas. OAuth/session material remains non-importable.
- Reusing a subscription must eventually invoke the provider-owned runtime;
  reading files from `~/.codex`, `~/.claude`, or similar roots would bypass the
  provider's controls and expose secrets.
- Stable Codex `exec` does not currently provide a reviewed, enforceable
  prompt-only/no-tools mode. Its read-only sandbox blocks writes but does not
  prove workspace-only reads, and `-C` only changes the working directory.
- Repository instructions could therefore cause Codex tools to read other host
  files and send their contents to the model. This is a release blocker for
  execution, not a limitation that UI copy can waive.
- Claude subscription execution remains blocked pending Anthropic approval or
  equivalent legal confirmation for third-party product use.

## Child Deliverables

1. `07-27-agent-session-host-hardening`: make the native Host suitable for
   future provider-process custody, durable leases, recovery, and cleanup. This
   hardening does not itself enable a runtime executor.
2. `07-27-codex-advisory-session-adapter`: Phase A only, implementing an
   explicit-user-gesture Codex version/identity/authentication probe with no
   model request and no credential-file reads.
3. `07-27-agent-session-settings-i18n`: present inventory and probe states in
   Settings, distinguish auth mechanisms truthfully, and show Codex execution
   as blocked/unavailable in every supported locale.

## Requirements

- Keep API-key import, local runtime probing, and future session delegation as
  separate capabilities and contracts. Never fall back between them.
- Inventory is metadata-only. It may report installation hints and reviewed
  support metadata but must never launch an Agent automatically.
- A runtime probe requires a deliberate user action and must not make a model
  request. The renderer cannot select executable, path, argv, environment,
  profile, login mode, auth material, workspace, command, or shell content.
- Codex Phase A supports only the canonical `codex` alias, exact reviewed
  version `0.145.0`, fixed bounded `--version` and `login status` commands, and
  revalidated executable identity. macOS requires Team ID `2DC432GLL2`; other
  platforms remain blocked until reviewed identity evidence exists.
- Native probing uses no shell, clears the inherited environment, rebuilds a
  positive allowlist, enforces time/byte bounds, and discards raw stdout/stderr.
  Cutout never reads auth files; an optional reviewed absolute `CODEX_HOME` is
  passed only for Codex-owned lookup.
- Authentication crosses IPC only as `chatgpt`, `api-key`, `access-token`,
  `unauthenticated`, or `unknown`. Only `chatgpt` may mention use of the existing
  Codex sign-in. Never claim remaining allowance, quota, entitlement, balance,
  or billing status.
- No Codex plan/apply/spawn/prompt/JSONL/result/cancellation/session API is
  released in Phase A. UI must not imply that successful probing enables a run.
- Phase B execution remains blocked until either enforceable workspace read
  confinement exists or a stable no-tools contract is source-reviewed and
  shown to prevent repository instructions from causing host-file reads.
- Claude remains `vendor-approval-required`; no Claude runtime executor, login
  flow, subscription copy, or rate-limit claim is released.
- Native Host hardening must preserve authorized-workspace identity, lease and
  process cleanup invariants without representing a provider executor as
  implemented.
- Keep native IPC, frontend schemas, inventory capability flags, Agent
  capability manifest, CLI/MCP/protocol truth, permissions, docs, tests, and
  i18n synchronized wherever a child changes the public contract.
- `.cutout` Design IR and provenance remain authoritative. Preview/apply rules
  remain unchanged and no generated export becomes an approval mechanism.

## Acceptance Criteria

- [ ] Host hardening is independently verified and does not create a reachable
      Codex or Claude execution surface.
- [ ] Codex inventory never launches the CLI; only an explicit probe action may
      run the two fixed, bounded, identity-validated commands.
- [ ] Probe results contain only sanitized capability/auth metadata and stable
      reason codes; no credential/session file, raw output, host path, masked
      key fragment, or account identifier crosses IPC or persists.
- [ ] Settings and i18n distinguish API-key import, Codex auth probing, blocked
      session execution, unsupported runtimes, and Claude vendor approval.
- [ ] A successful `chatgpt` probe states only that the existing Codex sign-in
      was detected; it does not claim a usable executor, quota, allowance,
      entitlement, billing status, or completed advisory run.
- [ ] Codex execution remains unreachable until the Phase B security blocker is
      separately reviewed and resolved. Claude execution remains unreachable.
- [ ] Existing provider discovery, Agent inventory, Agent Host, approval lease,
      and controlled-command security behavior continue to pass.
- [ ] `pnpm agent:validate`, focused Rust and frontend tests, i18n validation,
      TypeScript, lint, formatting, production build, and `git diff --check`
      pass for the touched surfaces.

## Out Of Scope

- Reading, importing, copying, migrating, or displaying OAuth/session tokens.
- Codex or Claude model requests, advisory sessions, patch generation, patch
  apply, session resume, retries, or background execution.
- Generic execution for all inventoried Agents.
- Login automation, account switching, quota metering, allowance/balance
  display, billing, or entitlement claims.
- Arbitrary shell execution, caller-selected tools/MCP servers, network policy
  bypass, additional directories, or permission bypasses.
- Treating `--sandbox read-only` or `-C <workspace>` as workspace read
  confinement.
- Headless/cloud Agent hosting, live collaboration, or remote session sync.
