# Technical design

## Registry

Create a Rust-owned `LocalAgentRegistry` with compile-time entries and a
validation test against the pinned parent research snapshot. An entry contains
identity/provenance, executable aliases, optional side-effect-free version argv,
reviewed root descriptors, and capability flags. It contains no secret parser.

The registry emits one row per Agent. Installation and capability state are
orthogonal so an installed Agent with an unsupported credential schema remains
visible and truthful.

## Probe boundary

- Resolve executable aliases without a shell.
- Never run package-manager installer commands during discovery.
- Resolve only registry roots and exact relative markers.
- Reject symlink components and non-regular marker files.
- Bound file metadata checks and process probes.
- Return sanitized labels such as `~/.codex`, never raw secret values or file
  contents.

## Compatibility

Keep the existing provider-candidate DTO and command while adding a richer
Agent inventory command/schema. The later UI task can migrate presentation
without forcing provider import compatibility changes in this child.

## Rollback

The inventory is additive. Individual entries or probes can be disabled by
capability state without deleting existing providers or changing stored keys.
