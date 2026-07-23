# Cutout

Agent-native Design OS for turning product evidence into reviewable design systems, prototypes, assets, and implementation starters.

**English** | [简体中文](README.zh-CN.md)

## What is Cutout?

Cutout is an Agent-native Design OS that turns ideas, requirements, screenshots, local files, and repositories into versioned, reviewable design systems, prototypes, brand assets, and implementation starters.

The authority is the project's `.cutout` Design IR and provenance, not a chat transcript or screenshot. Sources, requirements, tokens, materials, routes, component provenance, production state, and revisions remain inspectable by people and coding agents.

The product has three cooperating entry points:

- **Cutout desktop app**: the visual design, review, and delivery workbench.
- **CLI and local MCP**: controlled automation over the same project state.
- **Codex plugin**: installable Cutout workflow Skills plus a self-contained MCP runtime.

They consume the same `.cutout` state. They do not control each other through GUI automation or maintain a second project state model.

## Install the macOS app

Download the Apple Silicon DMG from [Cutout v0.1.5](https://github.com/Nebutra/cutout/releases/tag/v0.1.5), then drag Cutout into Applications.

The public macOS build is Developer ID signed, Apple notarized, and stapled before publication.

See the [code signing policy](docs/CODE_SIGNING_POLICY.md) for the macOS,
Windows, updater-signature, reviewer, and privacy release gates.

## Install the Codex plugin

Use Codex CLI `0.144.5` or a compatible plugin-enabled version.

```bash
codex plugin marketplace add Nebutra/cutout --ref v0.1.5
codex plugin add cutout@cutout-local
codex plugin list
```

`codex plugin list` should show:

```text
cutout@cutout-local  installed, enabled  0.1.5
```

Codex captures plugin Skills and MCP tools when a conversation starts. Open a new conversation after installing or updating the plugin.

#### Bind the controlled project

The host must bind the local MCP runtime to exactly one project through `CUTOUT_PROJECT_ROOT`. MCP tool arguments cannot replace this path, and the plugin never scans home, parent, or sibling directories to infer a project.

For a terminal-launched Codex session:

```bash
export CUTOUT_PROJECT_ROOT=/absolute/path/to/the/controlled/project
codex
```

For the Codex desktop app launched from the Dock:

```bash
launchctl setenv CUTOUT_PROJECT_ROOT "/absolute/path/to/the/controlled/project"
```

Quit and reopen Codex completely, then start a new conversation. The target must be a real Cutout project with valid `.cutout` state; do not bind the Cutout source repository as if it were a design project.

Without the variable, capability and Skill discovery remain available, while project-bound tools return `project-binding-required` without reading or writing arbitrary directories.

## How the Codex plugin works

```text
user request
  -> Codex loads the cutout-controller Skill
  -> starts the bundled local stdio MCP runtime
  -> binds one project through CUTOUT_PROJECT_ROOT
  -> handshake + capability status + progressive Skill read
  -> reads .cutout Design IR and provenance
  -> preview -> explicit approval -> apply -> validation and deliverable readback
```

Mutation rules:

- `.cutout` Design IR and provenance are authoritative; exports are reproducible projections.
- Preview before apply. Approval-gated operations require a real, non-invented approval id.
- Callers cannot choose arbitrary output directories; managed writes stay under `.cutout/exports/`.
- Read the result back and verify deliverable metadata and hashes after every apply.
- MCP does not expose credentials, arbitrary filesystem access, or the desktop-internal Agent Host lifecycle.

Suggested first request:

```text
Use Cutout to inspect the current project, its design system, and every prototype page.
Show me a change preview first; do not apply it yet.
```

## Current capabilities

- Tauri 2 + React 19 desktop workbench.
- Observable multi-turn Agent activity, outcome checklist, attachments, model routing, and thinking controls.
- Deterministic local image cutout, edge treatment, and material production.
- Versioned `design-ir.v1`, content-addressed artifacts, and provenance-aware source ingestion.
- Agent-planned multi-route prototypes with shared design-system context across pages.
- Design Kit, Brand/VI Kit, component manifest, and Next.js/Vite starter compilation.
- `cutout.control.v1` CLI and stdio MCP with idempotent request ids, optimistic revisions, durable run events, and cancellation.
- Policy- and approval-gated local writes with deterministic deliverable readback.

## Current non-capabilities

Cutout does not currently claim:

- hosted OAuth HTTP MCP or a cloud project service;
- live Figma synchronization;
- web fetching or search;
- video processing;
- cloud collaboration;
- a bundled headless model provider;

The Figma adapter only consumes an authorized snapshot supplied by its caller. URL ingestion records a credential-free descriptor and does not fetch the page. Hosted OAuth HTTP MCP remains a roadmap item, not a shipped capability.

## CLI quick start

[`cutout.agent-capabilities.json`](cutout.agent-capabilities.json) is the machine-readable authority for supported operations. Its schema is [`schemas/cutout.agent-capabilities.schema.json`](schemas/cutout.agent-capabilities.schema.json).

```bash
pnpm agent:validate
pnpm cutout --project . context --include summary,outcome,run-events
pnpm cutout --project . materials
pnpm cutout --project . validate
pnpm cutout --project . ingest --repo .
pnpm cutout --project . export-kit
pnpm cutout --project . export-starter --framework vite-react
```

Approval-gated apply:

```bash
pnpm cutout --project . export-kit --apply --approval-lease <host-issued-lease-id>
```

Apply never accepts a reusable approval string. The embedding desktop/agent
host must issue a short-lived, single-use lease bound to the exact operation,
preview digest, and expected Design IR revision. The CLI only consumes that
opaque lease; it cannot mint or broaden one.

## Project and export contract

A controlled project stores its manifest, Design IR, policy, artifact index, run events, and control ledger under `.cutout/`. Binary objects are content-addressed with SHA-256.

```text
.cutout/exports/design-kit/
.cutout/exports/brand-kit/
.cutout/exports/starter/
```

Generated files are immutable, hash-verified projections. Update source evidence or Design IR and recompile instead of editing generated tokens or starters as source data.

## Development

```bash
pnpm install
pnpm dev                 # browser workbench with hot reload
pnpm tauri dev           # desktop app with hot reload
pnpm test                # unit and contract tests
pnpm test:visual         # Playwright visual checks
pnpm agent:validate      # Agent/CLI/MCP/manifest consistency
pnpm plugin:build        # rebuild the self-contained Codex plugin runtime
pnpm plugin:validate     # validate plugin, Skills, MCP, and bundled modules
pnpm build               # TypeScript, production bundle, and bundle gates
pnpm tauri build         # desktop package
```

Stack: Tauri 2, React 19, Vite 8, TypeScript, Tailwind v4, and shadcn/ui.

Read more: [Codex plugin](docs/CODEX_PLUGIN.md) · [Agent integration](docs/AGENT_INTEGRATION.md) · [Headless Agent Control](docs/HEADLESS_AGENT_CONTROL.md)
