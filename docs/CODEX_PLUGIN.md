# Cutout Codex Plugin

Cutout ships a repo-owned Codex plugin package at `plugins/cutout`. It bundles
the controller skill, canonical brand asset, and a self-contained local stdio
MCP runtime. The plugin is a distribution layer over `cutout.control.v1`; it
does not create a second project state model.

## Build and Validate

```sh
pnpm plugin:build
pnpm plugin:validate
pnpm agent:validate
```

The build records a SHA-256 for every source module included in the runtime.
Validation fails when the committed bundle, capability metadata, product
skills, brand asset, marketplace entry, or MCP configuration drifts.

## Local Project Binding

The local plugin must be started with `CUTOUT_PROJECT_ROOT` set to the exact
project whose `.cutout` state it controls. This is a host boundary, not an MCP
tool argument. The plugin does not search the filesystem or accept a replacement
root after startup.

For a terminal-launched Codex session:

```sh
export CUTOUT_PROJECT_ROOT=/absolute/path/to/the/controlled/project
codex
```

If the variable is missing, static discovery tools remain available while
project-bound tools return `project-binding-required`; the server does not use
the launch directory as an implicit project. Set the variable and start a new
Codex session.

## Repo Marketplace

The development marketplace is `.agents/plugins/marketplace.json`. Add it and
install the plugin with the bundled Codex CLI:

```sh
codex plugin marketplace add .
codex plugin add cutout@cutout-local
codex plugin list
```

Plugin tools and skills are captured when a conversation starts. Verify the
installed/enabled status, then open a new conversation for testing.

## Supported Workflow

The controller sequence is handshake, capability status, progressive Skill
read, context/validation, preview, explicit approval where required, apply, and
verified deliverable readback. The exact operation inventory and limitations
come from `cutout.agent-capabilities.json`.

The local plugin does not provide a hosted account, OAuth, cloud project
service, web search, live Figma sync, video processing, or a headless model
provider. A hosted OAuth HTTP MCP is a roadmap item, not a current capability.
