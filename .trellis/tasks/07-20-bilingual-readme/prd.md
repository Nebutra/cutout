# Bilingual README

## Goal

Replace the root README with a concise Chinese/English product and installation guide for Cutout.

## Requirements

- Provide equivalent Simplified Chinese and English sections with top-level language navigation.
- Explain the Design IR authority, desktop app, CLI, local MCP, and Codex plugin relationship.
- Include macOS release installation and Codex marketplace/plugin installation commands.
- Explain `CUTOUT_PROJECT_ROOT`, the new-session requirement, preview/approval/apply/readback flow, and current capability boundaries.
- Preserve development and validation commands and link to deeper repository documentation.
- Do not claim Developer ID signing, notarization, OAuth HTTP MCP, cloud collaboration, live Figma sync, web fetching, video processing, or a bundled model provider.

## Acceptance Criteria

- `README.md` contains complete Chinese and English paths.
- Commands and local paths use valid repository or published release identifiers.
- Markdown links resolve to existing repository documents or the published `v0.1.0` release.
- `pnpm agent:validate` remains green because the README describes the existing contract without changing it.
