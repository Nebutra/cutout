# External Agent Control

> Codex, Claude Code and other Coding Agents are **external controllers** of
> Cutout. They are not embedded executors, model providers or integrations.
> They keep their own repository, tools, permissions and coding sandbox while
> Cutout exposes a product control plane through standard MCP and CLI.

Figma, Notion, GitHub, Obsidian, Pencil, Paper, Framer and Canva belong to a
different capability class: **integrations** implemented against each
product's documented API or SDK. A Figma node connector must never be described
as the mechanism by which Codex or Claude controls Cutout.

Astryx is a Design System Kit **consumer binding**, not a controller and not a
fact source. Cutout projects explicit Design IR/DTCG token and component maps
to an Astryx `defineTheme` input plus a reviewable `astryx theme build` plan.
Package detection is local-only; absent Astryx packages return
`adapter-required` and never cause an implicit install.

Cutout exposes a file- and protocol-based contract so an Agent can discover
what is real before it proposes or applies work. The authoritative discovery
document is [`cutout.agent-capabilities.json`](../cutout.agent-capabilities.json).
Do not infer capabilities from the desktop UI or historical roadmap text.

## AGENTS.md snippet

Add this to a repository that uses Cutout-generated design artifacts:

```md
## Cutout Design OS

- Read `cutout.agent-capabilities.json` and `.cutout/manifest.json` before using
  the Cutout control plane.
- Treat `.cutout` Design IR and source provenance as authoritative. Treat files
  below `.cutout/exports` as generated, hash-verified projections.
- Start with `pnpm cutout --project . context` and `validate`; preview any
  ingestion or export before requesting approval to apply it.
- Never invent an approval id or relax `.cutout` policy. An apply operation may
  run only after the user gives explicit approval for the reviewed plan.
- Never place API keys, authorization headers or provider credentials in a
  control request, source descriptor, manifest or receipt.
- Do not claim live Figma sync, URL fetching, web search, video processing,
  cloud collaboration or headless provider execution.
- Preserve source, license and provenance references when editing generated
  components or consuming assets.
```

Generated Next.js and Vite starters also include an `AGENTS.md` scoped to their
Design Kit and component provenance.

## Codex and Claude Code

Both clients can call the CLI directly. For tool discovery and structured
calls, configure the stdio MCP server:

Cutout also packages the same contract as a local Codex plugin under
`plugins/cutout`. See [Cutout Codex Plugin](./CODEX_PLUGIN.md) for build,
marketplace, installation, project-binding, and new-session verification steps.
The plugin runtime is self-contained, but local project binding still requires
the host-owned `CUTOUT_PROJECT_ROOT`; installation does not create a cloud
service or infer a project by scanning the filesystem.

```json
{
  "mcpServers": {
    "cutout": {
      "command": "pnpm",
      "args": ["cutout:mcp"],
      "env": {
        "CUTOUT_PROJECT_ROOT": "/absolute/path/to/the/controlled/project"
      }
    }
  }
}
```

`CUTOUT_PROJECT_ROOT` is a host boundary, not an input an MCP tool can override.
The server never exposes binary artifact bytes or credentials.

The same stdio server works for any MCP client; no Codex SDK, Claude Agent SDK,
prompt injection bridge, GUI automation or coding-sandbox takeover is required.

## Native controller handshake

An external controller follows this progressive contract:

1. `cutout_controller_handshake` binds the MCP process to the host-selected
   project and returns an opaque session/project binding.
2. `cutout_capabilities_status` distinguishes available, provider-required and
   planned capabilities, including a separate `integrations` inventory.
3. `cutout_skills_list`, then `cutout_skill_read`, disclose only the selected
   product workflow and deeper reference contract.
4. `cutout_outcome_submit` records the user's outcome and optional existing
   material/source ids. It never uploads bytes or accepts filesystem paths.
5. Domain tools preview and apply approved changes. The controller must not
   invent approval ids.
6. `cutout_run_events` / `cutout_run_cancel` observe or stop work, while
   `cutout_deliverables_read` returns verified metadata and hashes.

Equivalent CLI discovery is available through `discover`, `capabilities`,
`skills list`, and `skills read <id> [--reference]`.

`coding.*` operations are optional Cutout-side controlled-backend contracts.
They are not required for, and must not be confused with, an external Coding
Agent using Cutout. An external Agent may use its own sandbox to consume Cutout
deliverables without granting Cutout arbitrary shell access.

## Recommended Agent sequence

1. Read `cutout.agent-capabilities.json` and `.cutout/manifest.json`.
2. Call `context`, `materials` and `validate` without mutation.
3. Preview source ingestion or an export and retain its structured plan.
4. Present source, license, provenance, paths, hashes, cost/capability status and
   expected effects to the user.
5. Apply only after explicit approval and only if `.cutout` policy enables it.
6. Read the result back and run `validate` again. An accepted request is not
   proof that the intended material result exists.

Run lifecycle calls record observable state and cancellation. `run start` does
not execute a model by itself.

## CI gate

The repository validates the manifest against package metadata, CLI/MCP source
declarations and protocol enums:

```yaml
name: Cutout Agent Contract
on: [push, pull_request]

jobs:
  validate-agent-contract:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm agent:validate
      - run: pnpm test
      - run: pnpm build
```

A changed operation, MCP tool, protocol version or package version must update
the capability manifest in the same change.

## Migration from the GUI queue

The old `pnpm ai` queue and `window.__CUTOUT_AI__` API are compatibility-only.
They write commands into a running WebView and do not provide the durable
revision, approval, idempotency, replay, policy or output verification contract
of `cutout.control.v1`.

| Legacy intent | Supported replacement |
| --- | --- |
| inspect current project | `context`, `materials`, `validate` |
| maintain a multi-turn task | `run start/get/events/cancel` |
| import an idea/story/file/repository | `ingest` dry-run, then approved apply |
| change Design Markdown or tokens | `patch` dry-run; headless v1 does not apply patches |
| export tokens/design system | `export-kit` dry-run, then approved apply |
| export implementation starter | `export-starter` dry-run, then approved apply |
| invoke a configured model | no headless replacement yet; use a separately trusted provider host |

Do not bridge a missing v1 capability by silently falling back to the GUI
queue. Return the explicit `capability-required` or unsupported result instead.
