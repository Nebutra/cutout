# Changelog

## 0.1.7 - 2026-07-24

- Render unresolved Agent preparation on one active surface: keep a single compact activity bubble while substantive execution and approvals remain in the timeline.

## 0.1.6 - 2026-07-23

- Keep regenerate preparation activity transient: show only the current unresolved activity while work is active, replace it with the first streamed reply, and retain terminal evidence in the execution timeline.

## 0.1.5 - 2026-07-22

- Persist Agent conversation runs and immutable response branches in Git-managed `.cutout/run-events.json` state.
- Keep regenerated responses as navigable sibling branches and continue new turns from the selected branch.
- Preserve the hardened atomic four-platform release gates for macOS notarization, updater signatures, checksums, and provenance; Windows NSIS/MSI installers are explicitly unsigned and may trigger SmartScreen warnings.

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
