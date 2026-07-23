# Dependabot remediation design

## Boundaries

The change has two independent dependency-graph remediations and one explicit
non-remediation:

1. Replace the package-backed shadcn Tailwind support stylesheet with a local,
   licensed copy, then remove the unused shadcn CLI/MCP package graph.
2. Replace the registry VTracer package with a reviewed, local library-only
   copy that preserves the public API used by Cutout but omits the CLI and Clap.
3. Leave `glib` visible because the supported Tauri Linux stack has no
   compatible patched release.

No Agent capability, protocol, manifest, approval, provider, or export contract
changes are required.

## Frontend dependency flow

Current:

`src/index.css -> shadcn/tailwind.css -> shadcn CLI -> MCP SDK -> Hono server`

Target:

`src/index.css -> src/styles/shadcn-tailwind.css`

The local stylesheet must be byte-equivalent to the currently consumed
`shadcn` 4.12.0 support sheet apart from a provenance header. Its MIT license
must be retained in the repository. Keeping the complete support sheet avoids
silently dropping standard variants or utilities that checked-in or future
shadcn-derived components rely on.

`components.json`, checked-in UI component source, and Cutout's
`shadcn.adapter-plan.json` output format remain unchanged; none requires the npm
CLI to be installed as an application dependency. Future component generation
can use an explicitly versioned one-shot CLI.

## Rust dependency flow

Current:

`app -> vtracer 0.6.5 -> clap 2.34 -> atty 0.2.14`

Target:

`app -> vendor/vtracer 0.6.5 -> image + visioncortex + fastrand`

The local VTracer package retains upstream `lib.rs`, `config.rs`,
`converter.rs`, and `svg.rs`, the original package version, both upstream
licenses, and a provenance note. It deliberately has no binary target, Python
binding, or Clap dependency. Cutout's call sites continue using
`vtracer::ColorImage`, `vtracer::Config`, and `vtracer::convert` unchanged.

A direct local path dependency is preferred over an unmerged GitHub fork pin:
the reviewed source is available offline, Cargo resolution is reproducible,
and the patch can be removed when upstream publishes a corrected crate.

## Compatibility

- CSS generation must preserve open, closed, active, disabled, horizontal, and
  vertical state variants used by checked-in components.
- Local vectorization output must continue passing the existing PNG-to-SVG
  test and remain fully offline.
- Linux release support remains enabled.
- `glib` remains in the lockfile until Tauri/GTK publishes a coherent upgrade.

## Rollback

The two remediations are independently reversible. The frontend rollback
restores the package CSS import and dependency. The Rust rollback restores the
registry VTracer dependency and removes the vendored package. Lockfiles must be
regenerated after either rollback.
