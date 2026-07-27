# Add Agent session capability settings and i18n

## Goal

Phase A makes reviewed local Agent installation, support, and authentication
states understandable without presenting them as API-key providers or runnable
sessions. Settings may truthfully show that Codex is signed in with ChatGPT, but
all local Agent execution remains disabled as `filesystem-isolation-required`
until a separately reviewed workspace-only confinement contract exists.

## Background

- The current AI Settings surface is explicitly a BYOK provider list and model
  routing editor (`src/components/settings/sections/AiSection.tsx:1`), and local
  credential candidates currently appear inside that provider flow
  (`src/components/settings/sections/AiSection.tsx:151`). Agent-owned login state
  is a different authority and must not enter ProviderForm or model routing.
- Provider discovery rejects session/helper material as importable API keys
  (`src/services/ai/provider-discovery.ts:19`), while the 39-Agent inventory
  already separates `credentialAdapter` from `sessionDelegation`
  (`src/services/ai/local-agent-inventory.ts:48`). The UI must preserve that
  boundary.
- Review of stable `codex exec` found no pinned no-tools mode. Its documented
  `--sandbox read-only` prevents writes but does not prove that reads are limited
  to the authorized workspace. A read-only advisory run could therefore inspect
  other host files and is not releasable under Cutout's filesystem contract.
- A fixed native `codex login status` probe may classify authentication without
  making a model request or reading session files. A sanitized `chatgpt` result
  proves only that Codex is signed in with ChatGPT; it does not make execution
  available and must not be described as allowance reuse in Phase A.
- Codex `api-key` and `access-token` remain visible, truthful, and non-runnable
  through session delegation. Users are directed to the separate API provider
  configuration for BYOK use.
- Claude Code remains `vendor-approval-required`; its Anthropic API-key provider
  path stays separate, and no Claude subscription/session action is enabled.
- Lingui ships `en`, `zh-CN`, `ja`, `fr`, and `es`
  (`src/i18n/config.ts:8`). Catalog parity rejects missing or empty translations
  in any shipped locale (`src/i18n/__tests__/parity.test.ts:90`). English and
  Simplified Chinese require explicit semantic review; all five catalogs remain
  complete.

## Requirements

### R1. Separate information architecture

- AI Settings exposes two peer tabs: `API providers` and
  `Local Agent sessions`. Existing configured providers, reviewed API-key
  import, add/edit forms, and model routing remain entirely under
  `API providers`.
- The default tab remains `API providers`. A new `agent-sessions` Settings
  target activates and focuses the local-session tab before scrolling; existing
  provider and `model-routing` navigation remains unchanged.
- The local-session tab consumes the fixed 39-Agent inventory and a strict,
  sanitized capability/auth probe projection. It must not import or call
  provider drafts, key storage, model catalogs, generation, session plan/apply,
  run-event, cancellation, or result APIs.
- All 39 reviewed Agents remain reachable. Installed or blocked entries may be
  grouped first, but presentation must preserve stable Agent IDs and a compact,
  scroll-safe list for unsupported/not-installed entries.

### R2. Probe-only native boundary

- Phase A permits only reviewed, fixed, non-generating capability/auth probes.
  The webview supplies an Agent ID or chooses a closed refresh action; it cannot
  supply an executable, argv, path, environment variable, login flag, command,
  shell fragment, provider, endpoint, or credential selector.
- The Codex auth probe is fixed native `codex login status`. Native code maps
  recognized output to `chatgpt`, `api-key`, `access-token`,
  `unauthenticated`, or `unknown`, discards raw stdout/stderr, and returns stable
  sanitized status codes only.
- Probes must not invoke `codex exec`, Claude, a model request, login flow,
  helper, browser, arbitrary tool, network search, or installation command.
- The frontend consumes one shared strict probe schema and exhaustively maps
  stable enums. Unknown fields or enum values fail closed; React components do
  not parse raw command output or infer eligibility from installation alone.
- Probe results contain no executable/config/canonical workspace path,
  credential reference, masked secret, account identifier, raw output, stderr,
  command, argv, environment, PID, quota, or billing data.

### R3. Truthful non-runnable states

- Every local Agent row is non-runnable in Phase A. No row exposes `Use`, `Run`,
  `Test with a prompt`, `Continue`, or another control that could be mistaken
  for session execution.
- Codex + passing `chatgpt` auth displays `Signed in with ChatGPT` and the
  blocking status `Filesystem isolation required`. Supporting copy explains
  that local Agent execution remains unavailable until Cutout can confine reads
  to the authorized workspace. It must not claim allowance reuse, remaining
  quota, free/unlimited usage, or execution readiness.
- Codex `api-key` and `access-token` states are named exactly, remain
  non-runnable, contain no ChatGPT subscription/allowance claim, and offer only
  navigation to the separate API provider configuration.
- `unauthenticated`, `unknown`, probe failure, unsupported version/platform,
  permission-required, and not-installed states have localized, non-runnable
  explanations. Cutout does not automate login, installation, account switching,
  or permission bypass.
- Claude Code displays `Vendor approval required`, remains non-runnable, and may
  direct the user to the separate Anthropic API provider configuration.
- Other Agents display the exact adapter/inventory state, normally
  `Session delegation not supported`. No generic CLI execution,
  OpenAI-compatible guess, or fallback to a provider is allowed.

### R4. No execution UX in Phase A

- Do not add a local-session runtime choice to the Agent composer, model picker,
  routing configuration, or persisted provider/model state.
- Do not add session preview/plan, consent, apply, progress, stop/cancel,
  streaming output, advisory result, retry, resume, receipt, or run-history UI.
- Do not add dormant or hidden execution controls behind a feature flag. Phase A
  frontend and native permissions expose probe-only authority.
- Settings closing, refreshing, or changing tabs has no effect on Agent runs
  because Phase A cannot start one.

### R5. Localization and accessibility

- Every new visible string, tooltip, status, empty state, refresh action, error,
  and accessibility label uses a stable explicit Lingui ID. Product/runtime
  names remain verbatim.
- English and Simplified Chinese are complete, natural, and semantically
  equivalent for signed-in state, API-key/access-token state,
  `filesystem-isolation-required`, vendor approval, unsupported state, and BYOK
  navigation.
- Japanese, French, and Spanish contain the same IDs with non-empty translations
  so extraction, compile, and parity gates remain green.
- Copy distinguishes API-key import from local Agent login state, never calls
  Cutout's credential store macOS Keychain, never exposes billing estimates, and
  never implies that Cutout reads OAuth/session credentials.
- Tabs and rows expose accessible names and status text without relying on
  color. Refresh is a fixed-size icon button with a localized tooltip/name and
  an accessible polite probe-in-progress/probe-result announcement. The new
  Settings target is keyboard focusable on desktop and mobile.

## Acceptance Criteria

- [ ] AI Settings renders separate `API providers` and `Local Agent sessions`
  tabs; all provider/import/model-routing behavior remains in the first tab and
  no provider or execution API is reachable from the second.
- [ ] The local-session tab presents all 39 reviewed Agents through strict,
  exhaustive installation/support/auth states without exposing secrets,
  credential references, executable/config/workspace paths, raw output,
  commands, environment, PID, quota, or arbitrary fields.
- [ ] A passing Codex `chatgpt` fixture displays `Signed in with ChatGPT` plus
  `Filesystem isolation required`, remains non-runnable, and contains no
  allowance, quota, free, unlimited, ready, use, or run claim.
- [ ] Codex API-key/access-token fixtures are visibly non-runnable, contain no
  ChatGPT allowance/subscription claim, and navigate only to the separate API
  provider configuration.
- [ ] Claude Code displays `Vendor approval required`, cannot be selected or
  launched, and keeps the separate Anthropic BYOK route discoverable.
- [ ] The released frontend exposes no local-session composer choice,
  preview/consent/apply, progress/cancel, streaming/advisory result, retry,
  resume, or hidden execution control; native Phase A permissions expose probes
  only.
- [ ] Fixed auth/capability probes make no model request, never invoke
  `codex exec` or Claude, accept no caller command/path/env/login authority, and
  return only the strict sanitized projection.
- [ ] Existing `model-routing` Settings navigation still focuses the provider
  tab; `agent-sessions` activates and focuses the local-session tab on desktop
  and mobile.
- [ ] Every new Lingui ID exists with a non-empty value in all five shipped
  catalogs. English and Simplified Chinese are semantically reviewed and contain
  no misleading execution, isolation, subscription, billing, or credential
  claim.
- [ ] Focused schema, presenter, Settings, navigation, accessibility, and visual
  tests cover the full state matrix plus long English/Chinese copy without
  overflow, clipping, overlap, or layout shift.
- [ ] `pnpm i18n:ci`, catalog parity tests, focused Vitest, TypeScript, lint,
  focused Rust probe tests, formatting, `pnpm agent:validate`, the production
  build, and `git diff --check` pass without a live Agent/model request or
  optional GitHub Actions.

## Deferred Phase B

Session selection, native plan/confirmation, process launch, progress,
cancellation, advisory results, and run history require a new reviewed runtime
contract that proves workspace-only filesystem reads and a closed no-tools
surface. Phase B must be planned and approved separately; it cannot treat
`--sandbox read-only` as confinement evidence.

## Out Of Scope

- Any Codex or Claude model execution, including read-only advisory runs.
- Reading, copying, importing, exporting, displaying, or migrating OAuth/session
  tokens as provider API keys.
- Generic execution for all 39 Agents, arbitrary executable/argv/path/env input,
  shell access, login/install automation, or account switching.
- Automatic session routing, fallback between local sessions and BYOK
  providers, quota metering, allowance claims, or billing estimates.
- Codex writes, patch preview/apply, network access, added directories, resume,
  retry, background/headless/cloud execution, or a Settings-hosted run console.
