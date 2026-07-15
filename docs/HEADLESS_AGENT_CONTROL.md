# Headless Agent Control

`cutout` is the repo-native control surface for Codex, Claude Code, and other
coding agents. It uses `.cutout/` through the Headless Runtime and
`cutout.control.v1`; it does not send commands to the running desktop UI.

Agents should discover the exact current surface from
[`cutout.agent-capabilities.json`](../cutout.agent-capabilities.json), validated
by `pnpm agent:validate`. The manifest includes supported modes, effects,
approval requirements, managed paths and explicit non-capabilities.

It deliberately has no provider, credential, network, or arbitrary-file-read
capability. The selected project root is the only filesystem boundary, and the
runtime reads only its validated `.cutout` manifest and managed files.

## Shared run lifecycle

The GUI, CLI, and MCP use the same provider-neutral lifecycle contract:
`run.start`, `run.get`, `run.events`, and `run.cancel`. Runs are persisted as
append-only observable events in `.cutout/run-events.json`, can be replayed
after restart, use optimistic control revisions and request-id idempotency, and
support cursor-based event reads. Starting a run records intent but does not
silently invoke a model, paid tool, network capability, or hidden GUI queue.

The desktop app additionally contains an internal durable local Agent Host.
It persists scheduler checkpoints, node attempts, leases, heartbeat, retry
timers and side-effect receipts to `.cutout/agent-host-state.json` below a
workspace selected through an opaque desktop authorization handle. The path is
host-owned and is never a command argument. On restart, queued work pauses for
an explicit resume and interrupted running work enters recovery without
repeating completed nodes. Host events project into the existing run activity
model; they are not a second execution authority.

This desktop Host is intentionally not a `cutout.control.v1`, CLI, or MCP
surface. Headless `run.start/get/events/cancel` remain provider-neutral event
operations and do not start the desktop scheduler. No bundled Host executes a
model, arbitrary shell command, unrestricted filesystem operation, OAuth flow,
or cloud job.

```sh
pnpm cutout --project . run start --id run-123 --mode create "Create the verified result"
pnpm cutout --project . run get run-123
pnpm cutout --project . run events run-123 --limit 100
pnpm cutout --project . run cancel run-123 "User changed direction"
```

```sh
pnpm cutout --project . context
pnpm cutout --project . materials --kind prototype-page
pnpm cutout --project . validate --scope design,tokens,materials
pnpm cutout --project . patch tokens color.primary=#22c55e
pnpm cutout --project . ingest --repo .
pnpm cutout --project . ingest --repo . --apply --approval human-approved-20260711
pnpm cutout --project . export-kit
pnpm cutout --project . export-kit --apply --approval human-approved-20260711
pnpm cutout --project . export-brand-kit --input "$(cat brand-kit-input.json)"
pnpm cutout --project . export-starter --framework vite-react
```

Design and token patches are dry-run previews in v1. They are validated by the
same control protocol as the app and never write Design IR state. Controlled
source ingestion supports inline ideas/stories, credential-free URL descriptors
and relative local file/repository scans. It previews by default; apply requires
project policy and an explicit approval id. URL descriptors are not fetched.

`export-kit` defaults to a dry-run that compiles the complete file plan with a
SHA-256 for every output. Apply requires both a project policy that enables
`export.design-kit` and an explicit approval id. The destination is never an
argument: the runtime atomically writes only to
`.cutout/exports/design-kit/<deterministic-kit-id>/`, reads every file back, and
refuses to replace a revision whose hashes differ.

`export-brand-kit` has the same dry-run/apply boundary, but deliberately takes
a complete `BrandKitInput` JSON object. Its `document` must fingerprint exactly
to the persisted project DesignDocument; the compiler then accepts only
licensed, explicitly evidenced Brand/VI claims. It atomically writes only to
`.cutout/exports/brand-kit/<deterministic-brand-kit-id>/`, reads every file
back, and rejects symbolic links, traversal, or hash conflicts.

`export-starter` compiles either `next-app-router` or `vite-react` from verified
Design IR and explicit component evidence. Apply writes only below
`.cutout/exports/starter/<deterministic-starter-id>/`. It does not run a package
manager, infer JSX from screenshots or overwrite a conflicting revision.

## Controlled coding delivery

`coding.execute`, `coding.review`, and `coding.repair` accept a versioned
`cutout.coding-task.v1`, not a shell command. A task binds the goal and
acceptance criteria to a repository snapshot plus explicit Design IR, Brand
Kit, Design Kit, prototype, and image-asset references. It also declares the
target stack, writable relative paths, named quality checks, expected revision,
changed-file/byte budget, and time ceiling.

The runtime always produces a `cutout.coding-patch.v1` preview before apply.
Apply additionally requires project policy and an opaque approval id. The Node
workspace adapter rejects absolute/traversal/credential-shaped paths, symbolic
links, stale file hashes, repository snapshot conflicts, and changes outside
the declared path and byte budgets. Quality checks are host-injected named
capabilities (`typecheck`, `test`, `build`, `lint`, `visual-test`); the protocol
never accepts a command string. Receipts contain changed-file hashes, checks,
screenshot artifact references when supplied by a host, and full input/backend
provenance.

The bundled CLI/MCP host intentionally does not include a coding model or
process runner. Its `coding.*` calls therefore return `capability-required`
unless an embedding host injects both a controlled coding backend and workspace.
This prevents a generated patch or fake build result from being represented as
a completed coding delivery.

## MCP

Use the stdio server from the project root:

```json
{
  "mcpServers": {
    "cutout": {
      "command": "pnpm",
      "args": ["cutout:mcp"],
      "env": { "CUTOUT_PROJECT_ROOT": "/absolute/path/to/project" }
    }
  }
}
```

The server exposes only stable tools:

- `cutout_run_start`
- `cutout_run_get`
- `cutout_run_events`
- `cutout_run_cancel`

- `cutout_project_context`
- `cutout_list_materials`
- `cutout_validate`
- `cutout_dry_run_patch`
- `cutout_plan_source_ingest`
- `cutout_apply_source_ingest` (requires `approvalId`)
- `cutout_plan_design_kit_export`
- `cutout_export_design_kit` (requires `approvalId`)
- `cutout_plan_brand_kit_export` (requires explicit `BrandKitInput`)
- `cutout_export_brand_kit` (requires explicit `BrandKitInput` and `approvalId`)
- `cutout_plan_starter_export`
- `cutout_export_starter` (requires `approvalId`)
- `cutout_plan_coding_task`
- `cutout_apply_coding_task` (requires `approvalId` and an injected coding host)

Results are JSON-RPC/MCP `structuredContent` and are redacted by the runtime
before returning. Material results include metadata and SHA-256 addresses, not
binary artifact bytes.

## Paid/provider tool contract

`cutout.control.v1` reserves `tool.invoke` for outcome-driven tools such as
`generate-image`, `edit-image`, and `cutout`. A request declares the intended
result, input artifact IDs, a hard money/credit ceiling, and either
`explicit` or `auto-within-budget` approval. It never carries an API key,
authorization header, provider configuration, arbitrary file bytes, or an
executor-supplied receipt.

Provider/model availability and the estimated charge are host-owned facts. The
shared planner permits automatic execution only when paid actions are enabled,
the estimate fits both the request ceiling and host policy, and the selected
approval mode is satisfied. A completed executor must return an auditable
receipt containing capability, provider/model IDs, charged amount, output
artifact IDs, timestamps, and terminal status. Receipt schemas reject
credential-shaped values.

The current headless host intentionally has no provider executor. Its dry-run
therefore returns a truthful `capability-required` plan, and apply returns a
`capability-required` error without advancing the revision or recording a fake
success. Desktop BYOK assignments map to the same non-secret capability shape;
real provider execution remains outside this phase.
