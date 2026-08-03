# Remediate remaining Dependabot alerts

## Goal

Safely remove the remediable npm and Cargo Dependabot alerts without changing
Cutout's UI or vectorization behavior, while keeping the upstream-constrained
Linux `glib` alert visible and accurately documented.

## Background

- `@hono/node-server` is present only through the production `shadcn` CLI/MCP
  dependency chain. Cutout uses the package's Tailwind support stylesheet, but
  does not invoke its JavaScript CLI or MCP runtime.
- `atty` is present only because the published `vtracer` crate declares Clap 2
  unconditionally even though Cutout uses only VTracer's library API.
- `glib` 0.18 is required by the current Tauri Linux GTK/WebKit stack. Tauri
  2.11.5 still requires GTK 0.18, so there is no compatible released upgrade.

## Requirements

- Eliminate vulnerable transitive dependencies when Cutout can do so without
  incompatible major-version overrides or unreviewed production fork pins.
- Preserve the current shadcn-derived UI behavior while removing build-time or
  runtime packages that are not needed by the shipped application.
- Preserve local VTracer output compatibility and offline behavior while
  removing the unmaintained `atty` dependency from the Cargo graph.
- Keep supported desktop targets, including Linux, intact.
- Treat an upstream-constrained alert as unresolved until the vulnerable code
  is upgraded or safely patched; dismissal alone must not be described as a
  remediation.
- Keep npm and Cargo manifests and lockfiles reproducible after any approved
  implementation.

## Out Of Scope

- Forcing `@hono/node-server` 2.x below an MCP SDK that declares the 1.x line.
- Pinning production dependencies to an unmerged contributor fork.
- Removing Linux releases or maintaining a fork of Tauri's GTK/WebKit stack.
- Dismissing the `glib` alert as fixed without a compatible upgrade or an
  equivalent maintained patch.

## Acceptance Criteria

- [x] `@hono/node-server` is absent from `pnpm-lock.yaml`, and the frontend
      build preserves the Tailwind variants used by checked-in UI components.
- [x] `atty` and Clap 2 are absent from `src-tauri/Cargo.lock`, and focused
      local-vectorization tests pass without network access.
- [x] The `glib` alert is either removed through a compatible upstream upgrade
      or remains explicitly documented as upstream-constrained; it is not
      hidden or dismissed as fixed without equivalent patched code.
- [x] Dependency-tree checks, application build, tests, lint, Cargo checks, and
      `pnpm agent:validate` pass for the final approved change.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
