# Technical Design

## Boundary

The Codex plugin is a distribution and workflow layer. It does not become a
second Cutout runtime or state authority. All live operations continue through
the existing `cutout.control.v1` MCP handlers and validated `.cutout` state.

## Proposed Package

```text
.agents/plugins/marketplace.json
plugins/cutout/
  .codex-plugin/plugin.json
  .mcp.json
  assets/
  skills/cutout-controller/SKILL.md
  runtime/                 # self-contained local MCP bundle
```

The plugin manifest owns Codex install metadata. The capability manifest owns
implemented product claims. A validation script checks that plugin copy and
skill-referenced tool names remain a subset of the capability manifest.

## Data Flow

```text
Codex prompt
  -> Cutout controller skill
  -> plugin-provided stdio MCP
  -> cutout.control.v1
  -> validated .cutout Design IR / ledger / artifacts
  -> structured preview or verified receipt
  -> Codex response
```

The host selects one project root before the MCP server starts. The MCP process
never accepts a replacement root through a tool call.

## Selected Runtime

Refactor the MCP entry so its production build imports the shared headless
runtime directly, then emit a plugin-local Node bundle with required static
capability and skill metadata. The bundle must not use Vite SSR at runtime and
must not scan for a source checkout.

Project binding remains explicit through a host-owned `CUTOUT_PROJECT_ROOT` or
equivalent project-scoped MCP configuration. For local development, the repo
marketplace may supply a fixed test project binding only through the test
harness. A missing binding produces a structured setup-required response before
project state access. Public one-install workspace binding remains dependent on
the future hosted transport.

## Contract Ownership

- `cutout.agent-capabilities.json`: product capabilities and limitations.
- `scripts/cutout-mcp.mjs` or its extracted shared server module: MCP tool
  schema and dispatch.
- `.codex-plugin/plugin.json`: install metadata only.
- `skills/cutout-controller/SKILL.md`: workflow sequence and user-facing usage.
- `.agents/plugins/marketplace.json`: distribution policy.

The implementation must extract reusable MCP server definitions rather than
copying them into a plugin-only server.

## Compatibility and Rollback

- The plugin version follows strict semver and can use a Codex cachebuster only
  for local reinstall testing.
- Removing the repo marketplace entry and plugin directory fully rolls back the
  adapter without changing `.cutout` data.
- Runtime packaging changes must leave the existing `pnpm cutout:mcp` entry
  working for current users.
- Failure to resolve a supported project binding returns a structured
  capability/setup error before reading or writing project state.

## Roadmap

After the local plugin contract is stable, a separate roadmap phase may add a
hosted OAuth HTTP MCP for public distribution and one-install onboarding. That
phase requires a real remote Cutout project service, authentication,
authorization, tenant isolation, storage/provenance ownership, rate and budget
policy, privacy/legal metadata, and production observability. The current
plugin must not imply that any of those capabilities already exist.
