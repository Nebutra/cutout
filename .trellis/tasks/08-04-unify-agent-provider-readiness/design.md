# Technical design

## First-principles model

The user needs three effects: understand and plan the design task, generate new
images, and edit/reference-condition images. A Provider, credential, model,
protocol, or installed CLI is not itself a user outcome. Model readiness as a
capability graph whose leaves are executable adapters and whose root is the
current workflow's required capabilities.

```text
Design workflow readiness
├── planning
│   ├── codex-system (preferred)
│   └── direct-text-provider (fallback)
├── image-generation
│   └── direct-image-provider
└── image-edit
    └── direct-image-provider
```

Each leaf carries progressive evidence:

```text
installed -> authenticated -> capability-proven -> execution-proven
```

The aggregate is ready when every required capability has an eligible adapter.
`execution-proven` is useful health evidence but is not fabricated by running a
billable setup request. Before first use, authenticated + capability-proven is
eligible; after use, the latest terminal execution event updates health.

## Runtime contracts

Introduce a desktop-only `PlanningRuntime` boundary rather than making a system
Agent look like `ProviderConfig`:

```ts
type PlanningRuntimeId = 'codex-system' | 'direct-provider'

interface PlanningRuntimeEvidence {
  runtimeId: PlanningRuntimeId
  installed: boolean
  authenticated: boolean
  capability: 'proven' | 'unsupported' | 'unknown'
  execution: 'unproven' | 'succeeded' | 'failed' | 'stale'
  reason?: StableRuntimeReason
}

interface PlanningSession {
  start(input: StructuredPlanningInput): AsyncIterable<PlanningEvent>
  steer(text: string): Promise<void>
  cancel(): Promise<void>
  close(): Promise<void>
}
```

The capability router selects a `PlanningRuntime`; the existing image router
continues selecting a direct Provider/model assignment. Provider configurations
and runtime bindings never share credential storage or auth semantics.

## Native Codex adapter

The internal process and turn flow below is implemented behind a public release
gate. Signed executable validation, generated-schema negotiation, and the
source-reviewed zero-tool policy permit native-owned desktop turns, but public
conversation binding and turn execution remain false until a signed packaged
app completes a real turn against a healthy upstream. The adapter does not
allocate a placeholder conversation binding before a real Codex thread exists.

### Discovery and identity

Native code owns a closed registry entry for the canonical `codex` alias. It
resolves PATH plus the closed macOS Homebrew candidates used by Finder-launched
apps, rejects caller-selected paths/wrappers, verifies regular-file identity
and the reviewed macOS OpenAI signature, and records only sanitized
version/protocol status. Compatibility is feature-based over the stable app-
server subset rather than a forever-exact version string; unsupported responses
fail closed.

### Process and protocol

Spawn `codex app-server --stdio` without a shell under the existing durable
Agent Host. Renderer IPC contains only opaque workspace/conversation handles and
typed user input. The native side owns argv, environment policy, time/byte/event
limits, process group, request IDs, and termination.

Handshake flow:

1. Spawn and send `initialize` with Cutout client identity, then `initialized`.
2. Call `account/read` without refresh and project the result to a closed auth
   state. Discard account names, emails, tokens, plan/quota detail, and raw
   errors before IPC.
3. Call `model/list` and prove that at least one compatible text/vision model is
   selectable. Return only reviewed capability evidence needed by the router.
4. Start or resume the opaque thread associated with the Cutout conversation.
5. Start turns with host-owned cwd, `approvalPolicy: never`, network disabled,
   and restricted read roots containing only staged context artifacts.
6. Parse only known response/event envelopes. Stream agent-message deltas;
   project terminal completed/interrupted/failed states into Cutout run events.
7. Map steering and cancellation to `turn/steer` and `turn/interrupt`. Kill the
   process group on protocol overflow, broken transport, app shutdown, or Host
   lease loss.

Do not expose `command/exec`, `thread/shellCommand`, `process/spawn`, account
login methods, MCP/plugin methods, arbitrary dynamic tools, or arbitrary app-
server requests through IPC.

### Context boundary

For each conversation, native code creates a host-managed context directory
outside user-selected paths. Cutout writes only prepared, non-secret snapshots
such as intent, selected material metadata, current Design IR excerpts, and
required output schemas. The turn sandbox grants restricted read access to this
directory plus required platform defaults, no workspace write, and no network.

The model receives a compact structured context envelope with stable artifact
IDs and revisions. Binary image work remains with image Providers; the planning
runtime sees authorized thumbnails/descriptors only when the user supplied or
selected them. Context staging is bounded and content-addressed so a retry can
prove exactly which revision it consumed.

### Output boundary

Agent messages are presentation. Actionable output must validate against a
Cutout-owned schema and reference known artifact IDs/revisions. The renderer
turns valid proposals into existing previews; the existing policy and approval
lease decide apply. Invalid output produces a repair turn or a stable failure,
never a partial implicit apply.

## Direct Provider path

Keep `ProviderConfig`, Keychain custody, exact-path credential discovery/import,
native proxy origin pinning, wire-protocol validation, and catalog probe. Split
evidence currently collapsed into `verified`:

- authentication/catalog proven: the reviewed non-billable verification passed;
- capability proven: an exact model descriptor plus adapter/protocol supports
  the task;
- execution proven: a real generation/edit request completed and its receipt is
  bound to the provider/model/task.

The planning router may retain the existing direct text path as fallback, but a
system runtime is never converted into a `ProviderConfig` and a discovered
OAuth/session record is never importable.

## Readiness projection and Settings

Create a pure readiness projection over runtime evidence, Provider verification,
model descriptors/bindings, and last execution receipts. The projection returns
one overall state plus three capability rows and stable next actions. UI copy
does not mention six internal model dimensions in the primary view.

Advanced contains:

- selected runtime, sanitized version/auth state, and last execution health;
- Provider CRUD and exact image model assignments;
- credential provenance and verification evidence;
- unsupported/policy-blocked diagnostics such as Claude.

Remove the full 39-Agent matrix from the default setup component. No approved
diagnostics consumer remains, so delete its native command, permission,
frontend schema, and tests rather than retaining a compatibility surface.

## Lifecycle and recovery

The existing native Agent Host owns exactly one active Codex process per
authorized desktop workspace instance. Opaque thread bindings persist with the
Cutout conversation record. On renderer reload, native state is authoritative;
the client reattaches to an active turn or receives a terminal recovery event.
Workspace switch shuts down the prior binding. A failed runtime falls back to a
verified direct text adapter only before a turn starts; mid-turn failures remain
visible and retryable so two runtimes cannot publish competing results.

## Public contract truth

`cutout.agent-capabilities.json` may describe the desktop `codex-system` planning
runtime only after it is reachable and tested. The manifest must continue to
state that CLI/MCP headless control has no bundled system-Agent executor. Any
CLI, MCP, schema, docs, or permissions text touched by the runtime is updated in
the same change and validated with `pnpm agent:validate`.

## Rollout and rollback

1. Land the runtime/evidence contracts and pure readiness projection.
2. Land the native Codex app-server adapter behind an internal capability gate.
3. Bind the desktop conversation loop and prove a real structured turn.
4. Switch Settings to capability-first UX and remove the old primary inventory.
5. Enable `codex-system` only after packaged-app security and lifecycle tests.

Rollback disables the runtime registry entry and leaves the direct Provider
planning fallback plus direct image execution usable. Opaque runtime thread IDs
contain no credential and need no migration.
