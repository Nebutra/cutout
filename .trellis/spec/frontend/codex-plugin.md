# Codex Plugin Infrastructure

## Scenario: Package Cutout for Codex

### 1. Scope / Trigger

Use this contract whenever changing the Codex plugin manifest, marketplace,
controller Skill, MCP tool surface, headless/registry adapters, product Skill
catalog, or plugin runtime build. The plugin is a distribution layer over the
existing Cutout control plane, never a second implementation or state store.

### 2. Signatures

```sh
pnpm plugin:build
pnpm plugin:validate
pnpm agent:validate
codex plugin marketplace add .
codex plugin add cutout@cutout-local
```

The installed stdio server signature is:

```json
{
  "command": "node",
  "args": ["./runtime/cutout-mcp.mjs"],
  "cwd": ".",
  "env_vars": ["CUTOUT_PROJECT_ROOT"]
}
```

### 3. Contracts

- Required manifest: `plugins/cutout/.codex-plugin/plugin.json`.
- Repo marketplace: `.agents/plugins/marketplace.json`, stable name
  `cutout-local`, source `./plugins/cutout`.
- Runtime: `plugins/cutout/runtime/cutout-mcp.mjs`; it must not import Vite or
  call `ssrLoadModule` at runtime.
- Build receipt: `runtime/runtime-build.json` with protocol
  `cutout.codex-plugin-runtime.v1`, package version, and SHA-256 for every
  included repository source module.
- Static discovery data: `runtime-data/cutout.agent-capabilities.json` and an
  exact copy of `skills/`.
- `CUTOUT_PROJECT_ROOT`: optional only for non-project discovery
  (`cutout_capabilities_status`, `cutout_skills_list`, `cutout_skill_read`),
  required for every project-bound tool including handshake.
- Project root is host-owned. No tool parameter may replace it and the server
  must not search parent, sibling, home, or arbitrary paths to infer it.
- `scripts/cutout-mcp-server.mjs` owns tool schemas and dispatch. Source MCP and
  bundled MCP inject different runtime loaders into that one owner.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| `CUTOUT_PROJECT_ROOT` missing | Project tools return structured `project-binding-required`; no project read/write occurs. |
| Bound root has invalid/missing `.cutout` | Existing sanitized `runtime-unavailable`/validation result; no filesystem scan fallback. |
| Controller Skill names undeclared tool | `pnpm plugin:validate` fails. |
| Bundled source module changes | `pnpm plugin:validate` fails and instructs `pnpm plugin:build`. |
| Capability or product Skill copy drifts | `pnpm plugin:validate` fails. |
| Apply lacks an opaque approval id | Existing MCP input/approval error; never generate an id. |
| Plugin changed after install | Rebuild, validate, reinstall, and start a new Codex conversation. |

### 5. Good / Base / Bad Cases

- Good: build a self-contained runtime, set an explicit project root, call
  handshake/capabilities/Skill read, preview, request approval, apply, and read
  verified deliverables.
- Base: install without a project root; capability and Skill discovery work,
  while handshake truthfully reports setup required.
- Bad: point `.mcp.json` at a developer checkout, use `process.cwd()` from the
  plugin cache as a project, scan for `.cutout`, or claim hosted/OAuth behavior.

### 6. Tests Required

- `scripts/codex-plugin.test.ts`: spawn the committed bundle as a real process.
  Assert discovery without binding, `project-binding-required`, Skill reference
  reads, a valid bound handshake, and a valid project validation result.
- `scripts/cutout-adapters.test.ts`: prove the source CLI/MCP behavior remains
  compatible after shared-adapter extraction.
- `scripts/roadmap.test.ts`: retain canonical roadmap structure and links.
- `pnpm agent:validate`: assert operation/tool/manifest/plugin synchronization.
- Plugin Creator validator: assert the package follows Codex ingestion schema.
- After install, `codex plugin list --marketplace cutout-local` must show
  `installed, enabled`, and the installed bundle SHA-256 must match the source.

### 7. Wrong vs Correct

#### Wrong

```json
{
  "command": "node",
  "args": ["/Users/developer/cutout/scripts/cutout-mcp.mjs"]
}
```

This hardcodes one checkout, bypasses marketplace cache isolation, and cannot
be distributed or reproduced.

#### Correct

```json
{
  "command": "node",
  "args": ["./runtime/cutout-mcp.mjs"],
  "cwd": ".",
  "env_vars": ["CUTOUT_PROJECT_ROOT"]
}
```

The runtime is plugin-local, while the controlled project remains an explicit
host binding.
