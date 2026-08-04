# Unify system Agent runtime and image Provider readiness

## Goal

Make Cutout answer one product question: can it complete the user's design task
on this device? Reuse a supported system Agent login for conversation, intent
understanding, planning, Design System authoring, and orchestration; use verified
direct image Providers for image generation and image editing. Provider names,
credential sources, wire protocols, and model bindings are evidence behind this
answer, not competing setup workflows.

## Background

- The current Settings projection equates AI readiness with verified direct
  Providers plus six direct-model bindings
  (`src/components/settings/ai-setup-projection.ts`). It cannot represent a
  system Agent runtime as the planning executor.
- Automatic setup imports reviewed API-key material from local Agent config and
  binds direct Provider models (`src/services/ai/automatic-ai-setup.ts`). It does
  not reuse an authenticated system Agent session.
- The 39-Agent inventory reports installation and config markers but declares
  every `sessionDelegation` capability unsupported
  (`src/services/ai/local-agent-inventory.ts`,
  `src-tauri/src/commands/ai/local_agent_inventory.rs`). Installation is not
  authentication or execution evidence.
- Codex CLI 0.145.0 is installed and authenticated on the target Mac. The
  official current `codex app-server` contract is intended for rich third-party
  clients and exposes authentication, model discovery, structured threads and
  turns, streaming events, interruption, and approvals. Reviewed 0.145.0 and
  0.146.0 schemas do not expose a direct restricted-readable-root field;
  0.146.0 adds permission profiles and empty environment sets, but other tool
  families still require explicit disablement. The older probe-only security
  conclusion therefore remains the release boundary until the complete
  no-tools contract is proven.
- Claude Code 2.1.220 is installed and authenticated and has a structured
  non-interactive mode, but the existing Anthropic third-party subscription
  policy finding remains unresolved. Technical availability must not be shown
  as product authorization.
- Direct Provider verification already keeps secrets native, validates the
  stored origin/protocol, and probes the model catalog without a billable image
  request. These security boundaries remain useful.
- `.cutout` Design IR and provenance stay authoritative. A system runtime may
  propose plans and structured outputs but does not bypass preview/apply policy.

## Product Requirements

### R1. Capability-first readiness

- Derive one readiness projection from the capabilities needed by the current
  Cutout workflow, initially `planning`, `image-generation`, and `image-edit`.
- Resolve each capability independently. Do not require one Provider or runtime
  to satisfy every capability and do not equate `/models` success with completed
  execution.
- Evidence must distinguish `installed`, `authenticated`, `capability-proven`,
  and `execution-proven`. A state may only advance when the corresponding native
  or runtime event exists.
- The default Settings view shows the overall result and one row per required
  capability. Names such as Codex, MOX, OpenAI, Google, or Qwen are secondary
  provenance on the selected adapter.
- Missing capabilities are actionable individually. For example, a working
  Codex runtime with no image route reports that image generation/editing still
  need configuration instead of reporting generic Provider failure.

### R2. First real system Agent runtime

- Add a native-owned `codex-system` runtime adapter using canonical
  `codex app-server` over stdio. Do not read, copy, import, serialize, or expose
  Codex OAuth/session credentials.
- Resolve and revalidate the canonical signed executable natively. The renderer
  cannot supply a binary, path, argv, environment, auth material, or arbitrary
  working directory.
- Use the stable app-server subset: `initialize`, `account/read`, `model/list`,
  `thread/start|resume`, `turn/start|steer|interrupt`, streamed agent messages,
  and terminal turn states. Reject unsupported protocol behavior with a stable
  capability reason instead of parsing TUI text.
- Run turns in a host-managed Cutout context root with `approvalPolicy: never`,
  no network tool access, and restricted read access. Only explicitly prepared,
  non-secret context artifacts may be readable. Do not expose a project root,
  home directory, arbitrary paths, shell execution API, MCP servers, or runtime
  tool calls through the Cutout renderer.
- Bind one opaque Codex thread identity to a Cutout conversation so follow-up,
  steering, cancellation, and context continuity are real. Cutout owns the
  product run record and material provenance; the opaque runtime identity is not
  an approval or source of truth.
- Persist that opaque binding across app restarts for the same Cutout
  conversation. A new Cutout conversation creates a new Codex thread; context
  compaction and Design IR revision binding prevent stale history from silently
  overriding the current workspace state.
- Validate model outputs against Cutout-owned structured schemas before they can
  become plans, Design IR proposals, or tool requests. Existing preview/apply
  and paid-tool gates remain authoritative.
- Do not run a model request during background discovery or Settings refresh.
  Authentication and protocol capability may be proven non-billably; the first
  successful user turn establishes `execution-proven`.

### R3. Runtime selection and fallback

- Prefer an authenticated, capability-proven `codex-system` adapter for
  planning and design orchestration.
- Preserve a verified direct text Provider as a planning fallback when no
  approved system runtime is executable. This is an adapter fallback, not an
  imported or reinterpreted system login.
- Select adapters from deterministic capability evidence and health. Never
  silently reuse OAuth/session material as a direct Provider key.
- Start with Codex as the only enabled system runtime. Keep Claude as a truthful
  `policy-review-required` diagnostic until the third-party subscription
  boundary is resolved; do not ship a Claude executor or login UI in this task.
- Do not generalize session execution to the previous 39-Agent catalog. Remove
  that catalog from primary setup UX; unsupported inventory is not readiness.

### R4. Direct image Provider boundary

- Keep image generation and image editing on verified direct Provider adapters
  with native Keychain secret custody, pinned origin/protocol checks, and
  model-level capability evidence.
- Preserve reviewed local API-key discovery and explicit native import for
  direct Providers. OAuth/session discoveries are neither importable nor shown
  as a way to make a direct image Provider ready.
- `capability-proven` requires a compatible adapter, protocol, and exact model
  capability record. `/models` alone proves authentication/catalog access only.
- `execution-proven` for generation or editing is recorded only after a real
  task succeeds. Connection checks remain non-billable and must not generate an
  image merely to make Settings green.
- Image model quality recommendations remain separate from support: capable
  models may execute, while high-fidelity prototype generation recommends the
  reviewed strongest models.

### R5. Converged Settings UX

- Replace the current stacked Provider/discovered-credential/local-Agent/model-
  routing presentation with one `AI ready` or `Action required` summary and
  capability rows for planning, image generation, and image editing.
- Show at most the next action needed for each missing capability in the primary
  view. Connecting a direct image Provider, authorizing a supported runtime, or
  retrying a failed execution are distinct actions.
- Move Provider CRUD, credential-source provenance, exact endpoints/protocols,
  raw model bindings, runtime version/auth class, last verification evidence,
  and unsupported Agent diagnostics under Advanced.
- Do not add managed multi-account switching, quota display, or a second local
  Agent directory. The system CLI remains the account owner.
- Keep English, Simplified Chinese, Spanish, French, and Japanese copy in sync.

### R6. Contract and lifecycle truth

- Update native IPC, frontend schemas, Agent runtime, Settings, permissions,
  capability manifest, protocol/docs, and tests together for the implemented
  Codex runtime surface.
- The desktop-only runtime must remain distinct from the default CLI/MCP
  headless host. Do not claim a headless system-Agent executor.
- Native process custody must cover launch, bounded IO, protocol validation,
  crash recovery, app shutdown, workspace/conversation switch, cancellation,
  and stale-thread failure.
- No runtime result may invent approval, mutate Design IR directly, access an
  arbitrary path, or weaken paid-tool or export policy.
- Validate Agent contract changes with `pnpm agent:validate`.

## Acceptance Criteria

- [ ] On a clean install with an authenticated supported Codex CLI and a
      verified compatible image Provider, the default Settings view reports one
      ready outcome with separate planning, image generation, and image editing
      evidence; it does not ask for a text API key.
- [ ] With Codex authenticated but no image route, Cutout chat/planning is usable
      and Settings identifies only the missing image capabilities.
- [ ] With no approved system runtime but a verified direct text route, planning
      falls back truthfully; with neither adapter, planning is blocked with one
      actionable reason.
- [ ] Codex discovery and authentication checks make no model request, expose no
      credential/account payload, and never mark `execution-proven`.
- [ ] A GUI-started conversation creates/resumes a structured Codex app-server
      thread, streams agent text, supports steering and cancellation, and records
      `execution-proven` only after a completed turn.
- [ ] Native tests prove the Codex child cannot receive renderer-selected argv,
      environment, binary, home path, project root, readable root, approval mode,
      or tool configuration; malformed/oversized protocol events fail closed.
- [ ] Runtime turns cannot read outside the host-managed context boundary or
      obtain network/tool execution authority through Cutout.
- [ ] Structured planning output is schema-validated and enters existing
      preview/apply and provenance flows rather than mutating Design IR directly.
- [ ] Direct Provider verification, exact-path API-key discovery/import, image
      capability routing, and native secret/origin boundaries continue to pass.
- [ ] The 39-Agent matrix is absent from the primary setup journey; Advanced
      contains only evidence useful for remediation and never duplicates the
      same credential/runtime fact as separate successful setup paths.
- [ ] Settings states cover checking, ready, partial capability, unauthenticated
      runtime, unsupported runtime, Provider verification failure, execution
      failure, and recovery without contradictory success copy.
- [ ] Focused Rust and frontend tests, packaged desktop smoke tests, i18n checks,
      TypeScript, lint, production build, `pnpm agent:validate`, and
      `git diff --check` pass.

## Out Of Scope

- Managed Codex or Claude account creation, login, switching, quota, allowance,
  balance, billing, or entitlement UI.
- Copying or replaying OAuth/session tokens, or treating a system login as a
  direct Provider credential.
- Claude subscription execution until its third-party product policy is
  separately cleared.
- Generic execution for all locally installed coding Agents or compatibility
  with the old 39-Agent primary UX.
- Live Figma sync, web fetching/search, video processing, cloud collaboration,
  or a system-Agent executor in the CLI/MCP headless host.
