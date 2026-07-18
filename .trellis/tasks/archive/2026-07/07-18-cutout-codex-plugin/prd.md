# Adapt Cutout as a Codex Plugin

## Goal

Make Cutout discoverable and installable as a Codex plugin so a Codex user can
invoke Cutout's existing repo-native design workflows through reusable skills
and the authoritative Cutout control surface, without overstating unavailable
cloud, provider, browser, or desktop-host capabilities.

## Background

- ChatCut packages a Codex manifest, workflow skills, brand assets, a public
  marketplace, and a hosted OAuth HTTP MCP endpoint. Its one-install experience
  depends on that hosted endpoint, not on the manifest alone.
- Cutout already declares Codex as an external controller and exposes a stdio
  MCP plus CLI over `.cutout` Design IR. The MCP host is fixed to
  `CUTOUT_PROJECT_ROOT` and currently depends on the Cutout source checkout and
  its Vite runtime.
- Codex plugins are installed from marketplace snapshots into a cache. A plugin
  must therefore not rely on the source checkout remaining adjacent to the
  installed plugin or on a user-specific absolute path.

## Requirements

- R1. Add one repo-owned plugin package with a valid
  `.codex-plugin/plugin.json`, Cutout brand assets, and focused workflow skills.
- R2. Expose only operations listed by `cutout.agent-capabilities.json`; the
  plugin must not claim web search, video processing, live Figma sync, cloud
  collaboration, arbitrary filesystem access, or a bundled provider executor.
- R3. Preserve the Cutout safety sequence: discover and bind, inspect
  capabilities, submit an outcome, preview, obtain an explicit opaque approval
  where required, apply, and read verified deliverables.
- R4. Keep `.cutout` Design IR and provenance authoritative. Plugin copy and
  skills must not create a parallel project state model.
- R5. Keep CLI, MCP, protocol, capability manifest, plugin manifest, marketplace
  metadata, and user-facing docs synchronized and validated in the same change.
- R6. Avoid user-specific absolute paths and implicit filesystem discovery.
  Missing runtime or project binding must fail closed with an actionable error.
- R7. Provide a reproducible local installation and verification path using the
  Codex plugin CLI and a new Codex thread.
- R8. Reuse canonical Cutout brand assets; do not create replacement or
  hand-drawn logo artwork.
- R9. This task must complete the local infrastructure: a self-contained MCP
  runtime, plugin packaging, repo marketplace metadata, synchronized contract
  validation, installation smoke tests, and canonical roadmap updates.
- R10. Local project binding remains explicit through a host-owned
  `CUTOUT_PROJECT_ROOT` or equivalent project-scoped MCP configuration. The
  plugin must not scan the filesystem to guess a project. Missing binding is a
  truthful setup-required state, not a partial success.

## Acceptance Criteria

- [ ] The plugin passes the Codex plugin validator and its asset references all
  resolve inside the plugin package.
- [ ] The marketplace metadata passes schema/structure checks and exposes the
  plugin under the Design category.
- [ ] A clean local install reports `cutout` as installed and enabled.
- [ ] In a new Codex thread, the Cutout skill is discoverable and describes only
  capability-manifest-backed operations and limitations.
- [ ] The MCP integration either starts from a self-contained supported runtime
  or fails closed with documented setup guidance; it never depends on a
  hardcoded developer path.
- [ ] Preview/apply wording and tool use retain explicit approval requirements.
- [ ] `pnpm agent:validate` passes and validates synchronized plugin-facing
  capability metadata.
- [ ] Focused plugin/marketplace/install smoke tests pass without changing
  unrelated dirty worktree files.

## Out of Scope

- Building a hosted Cutout service, OAuth system, or cloud collaboration layer
  in this task. A hosted OAuth HTTP MCP is an explicit roadmap item for future
  public, one-install distribution.
- Claiming parity with ChatCut's video timeline or media-generation pipeline.
- Publishing to an OpenAI-curated public marketplace in this task.
- Weakening project-root, policy, approval, provenance, or secret boundaries.

## Product Decision

- Build the full local infrastructure now, including a self-contained local MCP
  runtime. Keep explicit per-project binding for the local transport. Record a
  hosted OAuth HTTP MCP as the future public-distribution transport in the
  canonical roadmap.
