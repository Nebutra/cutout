# Technical design

## Boundary

Phase A is a native capability/authentication probe, not a session adapter.
The webview may request a probe for the fixed Codex runtime identifier, but it
cannot provide an executable, path, argv, environment variable, auth material,
profile, config flag, prompt, workspace, or shell fragment.

Inventory and probing are separate. Inventory may report reviewed static
metadata and installation hints without launching Codex. Only a user gesture in
Settings starts the bounded probe.

## Native registry

Define one closed Codex probe contract containing:

- canonical alias `codex`;
- exact supported version `0.145.0`;
- macOS signing Team ID `2DC432GLL2`;
- fixed commands `codex --version` and `codex login status`;
- a cleared environment plus a documented minimal positive allowlist;
- optional validated absolute `CODEX_HOME` for Codex-owned auth lookup;
- per-command timeout and stdout/stderr byte ceilings;
- stable sanitized result and failure codes.

The native layer resolves the alias and validates the executable path, file
identity, version, platform signature, and Team ID immediately before each
probe. The exact same executable identity and environment snapshot are used for
both commands. Any drift between validation and spawn fails closed.

Other platforms return `platform-blocked` until equivalent package/signature
evidence is reviewed. Wrappers, aliases other than `codex`, caller-selected
paths, compatible-version ranges, and fallback executables are not accepted.

## Environment and process policy

Spawn directly without a shell. Start from `env_clear()` and add only the
native contract's minimum runtime variables. Do not inherit or accept API keys,
access tokens, proxy settings, provider/base-URL overrides, profiles, plugin
configuration, or arbitrary caller variables.

Cutout never opens Codex auth files. If an installation needs a non-default
Codex home, native code may pass only a previously reviewed, normalized absolute
`CODEX_HOME`; the path remains native-local and Codex performs the lookup.

Each command has a short timeout and separate byte counters. Timeout, overflow,
app shutdown, spawn failure, or executable drift terminates the process and
returns a stable sanitized state. Raw stdout/stderr is held only long enough to
perform exact parsing, then discarded.

## Data flow

1. Settings displays static inventory metadata and a user-triggered probe
   control. It does not probe on mount, startup, refresh, or timer.
2. The renderer sends only the fixed Codex runtime identifier.
3. Native code resolves and validates the reviewed executable identity.
4. Native code runs fixed `--version`, validates the exact version, then runs
   fixed `login status` using the same executable and environment.
5. Native code maps recognized output to a closed auth enum and discards all
   raw bytes.
6. IPC returns sanitized installed/support/auth state, stable reason code, and
   non-sensitive version metadata. No path or command output is returned.
7. Settings renders localized truthful copy. Only `chatgpt` mentions the
   existing Codex sign-in; execution remains visibly unavailable.

## Result contract

The versioned result contains only closed enums and bounded non-sensitive
metadata sufficient for UI state:

- probe status and stable reason code;
- supported/blocked capability state;
- reviewed Codex version when validated;
- auth class: `chatgpt`, `api-key`, `access-token`, `unauthenticated`, or
  `unknown`.

It contains no stdout, stderr, executable path, home path, account identifier,
masked credential, quota, billing data, prompt, workspace, or transcript.

## Compatibility and rollback

The probe is separate from BYOK import and from any Agent session execution
schema. Existing provider discovery remains unchanged. Agent capability truth
continues to report no released headless/session executor.

Rollback disables the Codex probe registry entry and leaves static inventory
visible with a truthful unavailable state. No credential data, session data, or
run history requires migration or deletion.

## Deferred Phase B

Do not implement `codex exec`, prompt transport, JSONL decoding, run events,
approval/apply, result rendering, resume/retry, or model-call cancellation in
Phase A. `--sandbox read-only` and `-C <workspace>` do not confine reads to the
workspace. Phase B remains blocked until enforceable workspace read confinement
or a source-reviewed stable no-tools mode is available.
