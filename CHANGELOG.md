# Changelog

## 0.1.5 - 2026-07-22

- Persist Agent conversation runs and immutable response branches in Git-managed `.cutout/run-events.json` state.
- Keep regenerated responses as navigable sibling branches and continue new turns from the selected branch.
- Preserve the hardened atomic four-platform release gates for notarization, Authenticode signing, updater signatures, checksums, and provenance.

## 0.1.4 - 2026-07-22

- Added a message-level Regenerate action for the latest completed Agent response without duplicating the source user turn.
- Clear superseded run failures as soon as a retry or regeneration attempt is accepted, preventing stale `Run stopped` and `No result yet` states.
- Kept message regeneration isolated from run-level recovery and paid-tool retry contracts.

## 0.1.3 - 2026-07-22

- Superseded the unpublished `v0.1.2` release after its macOS DMGs correctly failed the notarization gate.
- Explicitly submit each signed macOS DMG for Apple notarization, wait for acceptance, staple its ticket, and verify Gatekeeper acceptance before upload.
- Align Windows and Linux updater verification and manifests with Tauri v2's signed native NSIS `.exe` and `.AppImage` artifacts.

## 0.1.2 - 2026-07-22

- Restored Retry for interrupted Agent runs after reopening a project, preserving the original brief and existing approval boundaries.
- Unified Design and Deliver navigation, refined the Git workspace drawer, and aligned compact integration icons.
- Added common custom provider protocol families and strengthened explicit model-routing coverage.
- Removed desktop paid-operation auto-continue preferences so every paid tool action requires explicit approval.
- Added Developer ID signing, Apple notarization/stapling, four-platform updater verification, and hardened immutable GitHub Release publication.

## 0.1.1 - 2026-07-21

- Added signed in-app update discovery, download, install, and restart controls with a conditional Home update entry.
- Added atomic cross-platform GitHub Release publishing for Apple Silicon and Intel macOS, Windows x64, and Linux x64.
- Added local Git workflows, provider discovery, Creative Board delivery flows, and stricter Agent execution safety.
- Hardened approval leases, durable host ownership, controlled filesystem access, Tauri permissions, and release validation gates.
- Improved desktop scaling, Windows portability, generation-quality regression coverage, and Agent streaming behavior.

## 0.1.0 - 2026-07-20

- Added outcome-first multi-turn Agent runtime, governed paid actions, and observable repair loops.
- Added Brand VI Kit, Design System Kit, component, starter, Registry, workflow pack, and unified delivery contracts.
- Added external Coding Agent CLI/MCP control and Design Governance evidence gates.
- Added Global Library source-blob projection and transactional macOS Registry installation.
- Added hardened macOS release configuration and truthful signing/notarization gates.
