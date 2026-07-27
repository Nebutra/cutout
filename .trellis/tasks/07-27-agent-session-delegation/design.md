# Technical design

## Architecture

Keep three distinct surfaces:

1. Provider/BYOK import handles exact reviewed API-key schemas.
2. Local runtime inventory and Phase A probes expose sanitized capability and
   authentication metadata without model execution.
3. Future Phase B session delegation invokes provider-owned runtimes only after
   its filesystem/tool authority can be enforceably bounded.

The parent task owns sequencing and integration truth. Its three child tasks
own native Host hardening, Codex Phase A probing, and Settings/i18n. No child in
this release may represent a Codex or Claude executor as available.

## Phase A data flow

1. Inventory displays static, reviewed runtime metadata and never launches an
   Agent.
2. Settings offers an explicit probe action for the fixed Codex runtime ID.
3. Native code resolves canonical `codex`, revalidates exact version and signed
   identity, and constructs a cleared/allowlisted environment.
4. Native code runs fixed bounded `codex --version` and
   `codex login status` using the same executable identity and environment.
5. Native code maps recognized output to a closed auth enum, discards raw
   stdout/stderr, and returns only sanitized metadata and stable reason codes.
6. Settings renders localized auth/capability state while keeping execution
   absent or explicitly blocked.

The renderer supplies no executable, path, argv, environment, auth material,
profile, workspace, prompt, config flag, login flag, or shell fragment.

## Codex Phase A contract

The closed native registry pins canonical alias `codex`, exact supported
version `0.145.0`, macOS Team ID `2DC432GLL2`, fixed probe argv, timeout, byte
limits, environment allowlist, output parser, and stable errors. Executable
identity is revalidated before every probe. Non-macOS platforms fail closed
until an equivalent identity contract is reviewed.

Cutout does not open Codex authentication files. A reviewed absolute
`CODEX_HOME` may be provided only to the Codex process for its own lookup. Raw
command output remains native-local and is destroyed after mapping to
`chatgpt`, `api-key`, `access-token`, `unauthenticated`, or `unknown`.

Only `chatgpt` is described as an existing Codex sign-in. This classification
does not establish quota, allowance, billing, entitlement, or readiness to run
a model request.

## Native Host hardening

The Host hardening child prepares future native process authority: canonical
workspace locks, no-symlink identity-checked checkpoint IO, lease-aware
recovery, sanitized errors, bounded process metadata, watchdog cleanup, and
truthful platform capability states. Hardening does not register or spawn a
provider runtime in Phase A.

POSIX process-group custody and Windows capability truth remain requirements for
future execution. They must not be used to imply that the separate filesystem
read-confinement blocker has been solved.

## Settings and capability model

Settings models `api-key-import`, `runtime-probe`, future
`session-delegation`, and `unsupported/vendor-approval-required` separately.
Probe states cover idle, checking, supported auth classes, unauthenticated,
unsupported version, invalid identity, platform blocked, timeout/overflow, and
unknown output.

All supported locales explain that a probe detects local sign-in metadata only.
Successful detection must not enable a run button or reuse provider terminology
that suggests imported credentials, remaining quota, or subscription access.

## Phase B security gate

Stable `codex exec` has no reviewed enforceable prompt-only/no-tools mode.
`--sandbox read-only` stops writes but does not prove workspace-only reads, and
`-C` only sets the current directory. Repository content may influence tool
calls, so a run could read another host file and transmit it to the model.

Do not implement plan/apply/spawn, prompt transport, JSONL decoding, durable run
events, result rendering, resume/retry, or execution cancellation until either:

- the child process has enforceable read confinement to the authorized
  workspace and reviewed runtime necessities; or
- a stable no-tools contract is source-reviewed and proven to prevent all host
  file reads caused by repository instructions.

Resolving this gate requires a new Phase B design/security review. Phase A
completion, read-only sandboxing, cwd selection, and process custody are not
sufficient evidence.

## Claude boundary

Claude remains `vendor-approval-required` based on official third-party product
guidance. Store only the reviewed capability truth; do not add a Claude runtime
adapter, login flow, subscription reuse, or rate-limit display.

## Compatibility and rollback

Existing BYOK providers, local credential discovery, Agent inventory, CLI, MCP,
protocol, manifest, and headless capability claims stay truthful. Any public
contract changed by a child must be synchronized and validated with
`pnpm agent:validate`.

Rollback independently disables the Codex probe entry and Settings action while
leaving static inventory visible. Host hardening should remain compatible with
existing Host behavior. No credentials, transcripts, or run data require
migration or deletion.
