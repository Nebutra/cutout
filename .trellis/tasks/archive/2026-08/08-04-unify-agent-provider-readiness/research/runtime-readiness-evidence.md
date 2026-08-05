# Runtime and readiness evidence (2026-08-04)

## Official Codex contract

- `https://learn.chatgpt.com/docs/app-server.md`: app-server is the documented
  deep-integration interface for rich clients and provides authentication,
  conversation history, approvals, and streamed Agent events.
- The stable stdio protocol includes `initialize`, `account/read`, `model/list`,
  thread lifecycle, turn lifecycle, `turn/steer`, and `turn/interrupt`.
- `turn/start` supports `approvalPolicy`, a host-selected `cwd`, and sandbox
  configuration, but the reviewed `0.145.0` and `0.146.0` generated schemas do
  not expose `readableRoots`, `includePlatformDefaults`, `readOnlyAccess`, or an
  equivalent direct restricted-root field. The filesystem-read blocker recorded
  by the 2026-07-27 probe-only design therefore remains open.
- Dangerous methods such as `thread/shellCommand`, `command/exec`, and
  `process/spawn` exist but are not required by Cutout and must not be exposed.
- `https://learn.chatgpt.com/docs/non-interactive-mode.md`: Codex non-interactive
  execution reuses saved CLI authentication by default. Cutout should invoke
  the owner runtime, not read its auth cache.
- `https://learn.chatgpt.com/docs/auth.md`: Codex auth files/tokens are secrets.
  Cutout must use `account/read` only for sanitized state and never copy auth.

## Target-machine probes

- Canonical Codex: `/opt/homebrew/bin/codex`, `codex-cli 0.145.0`.
- Finder-launched macOS applications commonly omit `/opt/homebrew/bin` from
  `PATH`; the native runtime registry must also inspect the closed reviewed
  candidates `/opt/homebrew/bin/codex` and `/usr/local/bin/codex`, then apply
  the same canonical-file and Team ID checks.
- `codex login status` returned success with output discarded.
- Canonical Claude Code: `/Users/tseka_luk/.local/bin/claude`, version 2.1.220.
- `claude auth status` returned success with output discarded.
- Claude exposes structured `--print`, `--output-format stream-json`, tools
  disabling, safe mode, session IDs, steering input, and cancellation-compatible
  process behavior. Technical feasibility does not resolve the existing
  third-party subscription policy finding.

## Codex 0.146.0 source review

- The official npm `@openai/codex@0.146.0` macOS binary remains signed by Team
  ID `2DC432GLL2`.
- The `rust-v0.146.0` source and generated app-server schema introduce
  permission profiles and `thread/start.environments`.
- Passing `environments: []` removes environment-backed `shell`, `exec`,
  `apply_patch`, `view_image`, and `request_permissions` tools. It does not by
  itself prove that MCP, apps/plugins/extensions, dynamic tools, web search,
  plan/request-user-input, multi-agent, image generation, or other hosted tools
  are absent.
- A future prompt-only adapter may use an isolated native-managed `CODEX_HOME`
  and expose only the exact Codex-owned auth file by reference, without reading
  or copying credential content. That design still requires source-reviewed
  configuration for every non-environment tool family and a packaged execution
  proof before turns can be enabled.
- Cutout therefore keeps the installed `0.145.0` probe-only and does not persist
  a placeholder conversation binding. A Cutout binding ID with no actual Codex
  thread would be bookkeeping, not conversation continuity.

## Codex 0.146.0 zero-tools and authenticated-turn proof

- The task-owned
  `research/probe-codex-zero-tools.mjs` executes `codex app-server --stdio
  --strict-config` against a loopback Responses capture provider whose runtime
  capability upper bound matches the normal OpenAI-compatible provider:
  namespace tools, image generation, and web search are all available before
  configuration gates are applied.
- `thread/start.environments: []` removes environment-backed shell, exec,
  apply-patch, view-image, and permission tools, but is insufficient by itself.
  The first captured request still exposed the `skills` namespace even with
  skill prompt injection disabled.
- A prompt-only request requires both `[orchestrator.skills] enabled = false`
  and `[orchestrator.mcp] enabled = false`, plus an empty isolated Codex home,
  `dynamicTools: []`, `environments: []`, `web_search = "disabled"`, disabled
  update-plan/request-user-input, disabled agents, and explicit false values for
  every default-enabled tool-bearing feature (apps, plugins, browser/computer
  use, image generation, collaboration, hooks, goals, and related discovery or
  installation surfaces).
- With that closed configuration, the captured strict-mode request contained
  exactly `tools: []`. `turn/start.outputSchema` was forwarded as a
  `json_schema` response format and the mock turn reached `turn/completed`.
- A second run used the official `@openai/codex@0.146.0` binary and a fresh
  isolated `CODEX_HOME`. The only authentication bridge was a symbolic link to
  the existing exact Codex-owned `auth.json`; the experiment did not open,
  copy, parse, print, or persist the credential content. The working directory
  contained only the staged probe context.
- The authenticated structured turn completed successfully. One run emitted a
  sanitized retryable `responseStreamDisconnected` event and completed after
  roughly 90 seconds, proving that the native lifecycle needs visible retry
  state, cancellation, and a turn deadline longer than the short discovery
  timeout.
- This proof removes the prior no-tools feasibility blocker for 0.146.0 only.
  Cutout must still implement and test native process custody, strict config
  materialization, opaque thread persistence, bounded protocol parsing,
  streaming, interruption, schema validation, stale-event rejection, and
  packaged execution before advertising `turnExecution: true`.

## Existing Cutout evidence

- `src/services/ai/automatic-ai-setup.ts` imports direct API credentials and
  derives six direct model bindings; it has no system runtime adapter.
- `src/components/settings/ai-setup-projection.ts` derives readiness from direct
  Provider verification, bindings, and discovered credentials.
- `src/services/ai/local-agent-inventory.ts` and
  `src-tauri/src/commands/ai/local_agent_inventory.rs` expose a pinned 39-Agent
  installation/config inventory. Every row reports session delegation as
  unsupported, so the inventory cannot satisfy planning execution readiness.
- `src-tauri/src/commands/ai/provider_discovery.rs` already enforces reviewed
  exact-path API-key discovery and keeps OAuth/session candidates non-importable.
- `src/services/ai/provider-verification.ts` and native Provider proxy code keep
  direct Provider verification and secret/origin boundaries separate from model
  execution.
- `src/agent-host/*`, `src-tauri/src/commands/agent_host.rs`, and
  `src/agent-runtime/run-coordinator.ts` provide reusable process lifecycle,
  lease, cancellation, stale-event, and durable run primitives.
