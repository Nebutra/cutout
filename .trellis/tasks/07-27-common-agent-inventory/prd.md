# Common Agent inventory registry

## Goal

Ship a native, offline registry and sanitized inventory for all 39 coding
Agents in the pinned Paseo 2026-07-27 catalog. Users can see what is installed,
which reviewed configuration roots exist, and which Cutout capabilities are
available without exposing or importing credential material.

## Requirements

- The registry contains exactly the 39 parent-task catalog entries with stable
  Cutout IDs, display names, CLI aliases, provenance, and last-reviewed date.
- Local detection is read-only and bounded. It may resolve PATH executables,
  reviewed app-bundle locations, and exact registered roots/files.
- Detection never launches `npx -y`, `uvx`, installers, login flows, shells, or
  arbitrary commands. Version probes are separate allowlisted argv and run only
  where verified side-effect free.
- Every entry returns a sanitized state: not installed, installed, config root
  found, credential adapter supported/unsupported, session delegation
  supported/unsupported, permission required, or probe failed.
- Existing Codex and Claude provider candidates remain compatible while their
  installation metadata is projected through the new registry.
- No secret file contents or credential-shaped field may cross native IPC.

## Acceptance Criteria

- [x] Registry validation proves exactly 39 unique stable entries matching the
  pinned parent research artifact.
- [x] All 39 entries produce a deterministic inventory row on macOS even when
  no Agent is installed.
- [x] Tests prove installer forms, arbitrary paths, symlinks, home recursion,
  and secret-shaped output are rejected.
- [x] Installed binary and reviewed root detection is covered by fixtures for
  direct binaries, aliases, missing tools, permission errors, and stale paths.
- [x] Existing Codex/Claude discovery tests continue to pass.
- [x] Frontend service schemas reject unknown or secret-bearing native fields.

## Dependency

This is the first child deliverable. Credential adapters, session delegation,
and the final settings UI consume its stable registry and inventory DTO.
