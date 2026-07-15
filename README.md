# Cutout

Cutout is an Agent-native Design OS for turning mixed product evidence into a
versioned, reviewable design system and implementation starter. Its durable
contract is Design IR, not a chat transcript or a screenshot: sources,
requirements, tokens, materials, prototype structure, component provenance and
revisions remain inspectable by people and coding agents.

The desktop app provides the visual workbench. The repo-native CLI and MCP
server let Codex, Claude Code and other clients inspect the same project,
preview changes, ingest controlled sources and export deterministic artifacts
without automating the GUI.

## Current closure

The implemented path is:

```text
idea / story / URL descriptor / local file / repository
  -> source + provenance records
  -> design-ir.v1
  -> Design Kit / evidence-backed Brand Kit
  -> verified component manifest
  -> Next.js App Router or Vite React starter
```

Today Cutout supports:

- a Tauri 2 + React 19 visual workbench with an observable multi-turn Agent
  activity model, outcome checklist, attachments, model routing and thinking
  controls;
- deterministic local image cutout and material workflows;
- versioned `design-ir.v1`, content-addressed artifacts and provenance-aware
  source ingestion;
- deterministic Design Kit (`DESIGN.md`, tokens, Tailwind v4 and theme files),
  Brand/VI Kit and starter compilation;
- `cutout.control.v1`, a repo-native CLI and a stdio MCP server with request-id
  idempotency, optimistic revisions, durable run events and cancellation;
- a desktop-internal durable local Agent Host with atomic checkpoints, leases,
  heartbeat, pause/resume, bounded retry, cancellation and restart recovery
  below an explicitly authorized workspace `.cutout` directory;
- approval- and policy-gated writes restricted to `.cutout/exports/`.

Cutout does **not** currently provide live Figma sync, OAuth connector hosting,
web crawling/search, video processing, cloud collaboration or a headless model
provider. The Figma adapter consumes an authorized snapshot supplied by its
caller; URL ingestion records a credential-free descriptor and does not fetch
the page. Paid tool requests have a strict budget/approval contract, but the
headless host truthfully returns `capability-required` because it has no
provider executor.

The durable desktop Host is a local scheduler and checkpoint service, not a
model provider or shell runner. It starts only after the desktop user grants an
opaque workspace handle; callers cannot provide a filesystem path. Its run and
receipt checkpoint is authoritative, while Agent activity events are an
idempotent UI projection. The CLI and MCP do not expose this desktop-internal
Host lifecycle.

## Agent entry points

Start with the machine-readable capability manifest:

```text
cutout.agent-capabilities.json
```

Its schema is `schemas/cutout.agent-capabilities.schema.json`. It lists the
supported CLI commands, MCP tools, control operations, approval boundaries,
managed paths and explicit non-capabilities. Validate it against the current
source surface with:

```bash
pnpm agent:validate
```

Common read-only and dry-run operations:

```bash
pnpm cutout --project . context --include summary,outcome,run-events
pnpm cutout --project . materials
pnpm cutout --project . validate
pnpm cutout --project . ingest --repo .
pnpm cutout --project . export-kit
pnpm cutout --project . export-starter --framework vite-react
```

Apply operations require both project policy and an explicit approval id. The
caller cannot choose an arbitrary output directory:

```bash
pnpm cutout --project . export-kit --apply --approval <opaque-approval-id>
```

See [Headless Agent Control](docs/HEADLESS_AGENT_CONTROL.md) for the protocol
and MCP setup, and [Agent Integration](docs/AGENT_INTEGRATION.md) for
`AGENTS.md`, Claude Code and CI examples. `docs/AI_NATIVE.md` documents only the
deprecated WebView queue compatibility bridge.

## Project contract

A controlled project stores its manifest, Design IR, policy, artifact index,
run events and control ledger under `.cutout/`. Binary objects are addressed by
SHA-256. Generated bundles are immutable, hash-verified directories under:

```text
.cutout/exports/design-kit/
.cutout/exports/brand-kit/
.cutout/exports/starter/
```

Generated files are projections. Update source evidence or Design IR and
recompile instead of treating generated token or starter files as the source of
truth.

## Development

```bash
pnpm install
pnpm dev                 # browser workbench with hot reload
pnpm tauri dev           # desktop app with hot reload
pnpm test                # unit and contract tests
pnpm test:visual         # Playwright visual checks
pnpm agent:validate      # capability/schema/source consistency
pnpm build               # TypeScript, production bundle and bundle gates
pnpm tauri build         # desktop package
```

Stack: Tauri 2, React 19, Vite 8, TypeScript, Tailwind v4 and shadcn/ui.

The macOS build is not currently notarized. A local package can therefore
require the standard right-click **Open** flow in macOS Privacy & Security.
