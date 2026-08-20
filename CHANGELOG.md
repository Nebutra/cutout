# Changelog

## 0.1.25 - 2026-08-20

- Split provider configuration into three layers that cannot be collapsed: the
  connection, the model catalog that connection advertises, and the per-task
  routing table. A provider no longer carries a required default model.
- Resolve every generation call by task, so a distinct binding for web
  development or image editing is honoured instead of being shadowed by the
  text or image-generation binding.
- Remove the per-provider-kind default-model fallback: a call with no bound
  model now reports the task that needs one instead of spending on a model the
  user never configured. Existing setups are migrated once from their legacy
  default model.
- Persist a connection's probed model catalog beside the connection rather than
  in a browser verification receipt, so clearing web storage no longer strips a
  provider of its models. Verifying a provider and refreshing its catalog are
  now one action with one writer.
- Rebuild Settings AI as two explicit steps — connect providers, then assign
  models to tasks. A task row names its provider and model instead of a bare
  model id, and says which task an unassigned route inherits from.

## 0.1.24 - 2026-08-17

- Publish the Canvas-first Agent workflow with bounded Commerce production and
  coherent Game Asset family and map delivery from the reviewed main branch.
- Decode local Game Map planning references into bounded canvas previews rather
  than passing user-derived object URLs into the DOM.
- Stabilize release tests across macOS, Linux, Windows, Node 22, and Node 24 by
  keeping importable benchmark modules shebang-free and awaiting async map
  projections before asserting their evidence.
- Prepare the packaged-app smoke evidence directory before native startup so
  Apple Silicon release builds verify the real signed application reliably.
- Retry a macOS bundle build once, and only once, when Apple's timestamp service
  returns its known transient missing-timestamp failure; all other signing
  failures remain hard release blockers.

## 0.1.21 - 2026-08-17

- Make Agent and Canvas the primary Design OS workflow while keeping Project
  files, Git, DESIGN.md, delivery details, and diagnostics progressively
  available as secondary tools on desktop and mobile.
- Add bounded Commerce Project production and held-out operator paths with
  localized material DAGs, retained bytes, exact receipts, stale-result
  blocking, replay recovery, and native evidence admission.
- Add reviewable multi-action Game Asset families and layered map production
  with targeted repair, deterministic native previews, runtime manifests, and
  content-addressed candidate bundles.

## 0.1.20 - 2026-08-14

- Improve automatic local AI setup so verified text and image routes are
  selected independently from the credentials already present on the device.
- Bind provider credentials to the signed macOS Cutout process without
  broadening Keychain access; existing legacy items migrate only after macOS
  permits their first read.
- Move governance-only code off the first-paint bundle and strengthen
  background packaged production evidence for Agent-authored planning.

## 0.1.19 - 2026-08-05

- Show Agent preparation as four named phases — context, runtime, response, validation — inside one compact disclosure, instead of a single opaque wait.
- Negotiate a supported Codex version range and generated-schema features rather than pinning one exact version, and report turn failures as a closed set of causes instead of a generic terminal error.
- Discover a bounded Codex Provider failover queue instead of only the current entry.
- Decide Provider execution from capability, host policy, and explicit approval alone; advisory estimates no longer authorize or refuse work, and receipts retain only Provider-returned verifiable execution evidence.

## 0.1.18 - 2026-08-04

- Present one capability-first AI readiness view for planning, image generation, and image editing while keeping runtime and Provider evidence distinct.
- Decode bounded structured native failures into actionable messages without rendering `[object Object]`, serializing arbitrary payloads, or exposing credential-shaped values.
- Strengthen signed packaged E2E discovery with isolated Provider metadata, native Keychain reuse, closed diagnostics, and truthful capability gates.

## 0.1.17 - 2026-08-03

- Keep reviewed image-edit model evidence Provider-neutral by recording exact model capabilities independently from Provider adapters.
- Route image generation and image editing independently so different verified models and Providers can serve each capability only when an implemented adapter supports the route.
- Use reviewed quality rankings only to guide image-model recommendations; rankings do not establish generation, editing, or transport support.

## 0.1.16 - 2026-08-03

- Present reviewed release highlights in English, Simplified Chinese, Japanese, French, and Spanish.
- Show available release details in Updates & Support before users download and install an update.
- Open What's New once after an upgrade and keep the current version's notes available offline from Updates & Support.

## 0.1.15 - 2026-08-03

- Overlap bounded observational page QA with later page image generation when image and Vision assignments use independent Providers, while retaining inline review for shared Providers.
- Keep page-image and page-QA concurrency at three, await every review before suite completion, and preserve one image call per missing page with zero automatic QA rerolls.
- Preserve stable anchor conditioning, ordered page publication, reuse and cancellation behavior, and Agent-authored page and material scope.

## 0.1.14 - 2026-08-02

- Deliver the user-selected Design System direction first while continuing every sibling to complete, independently verifiable fidelity.
- Preserve candidate-local page and resource frontiers across Retry so transient Provider failures replay only missing work and never cancel ready siblings.
- Add honest per-suite progress and bounded remaining-time states without fixed page or material quotas.
- Require terminal packaged evidence for Design System projections, route/page media, resource-pack bindings, re-read artifact bytes, provenance, and review documents, with matching terminal result and progress status.

## 0.1.13 - 2026-07-31

- Deliver three complete, comparable Design System and prototype-suite directions with Agent-authored route topology, useful non-UI material scope, and independently attributable resource packs.
- Remove the unfinished Coding handoff from the visible asset-production journey and make exact selected resource-pack completion the packaged end-to-end result.
- Reduce image-call amplification with one reference-conditioned page attempt, observational QA, grouped board cutouts, bounded concurrency, resumable failure frontiers, and no fixed page or per-page material quota.
- Automatically import reviewed local Agent credentials through the native boundary while keeping Provider secrets in Keychain and the background packaged journey non-frontmost.

## 0.1.12 - 2026-07-28

- Replace the crowded AI settings default view with one outcome-led setup status that reports checking, ready, action required, or unavailable.
- Base readiness on verified enabled Providers and complete model-capability coverage, with direct actions for reviewed credential imports or missing capabilities.
- Keep Provider management, manual model bindings, and Vectorizer configuration available under one advanced disclosure while preserving explicit credential-import approval and native-only secrets.

## 0.1.11 - 2026-07-27

- Scan and display a fixed reviewed inventory of 39 local coding Agents without recursively scanning the home folder or executing installed tools.
- Detect and import API keys from nine exact Agent configuration schemas while keeping OAuth, session, bearer, helper, and keyring material non-importable.
- Harden the native Agent Host with descriptor-relative checkpoints, lease-aware recovery, sanitized durable errors, and owned POSIX child-process custody.

## 0.1.10 - 2026-07-27

- Stabilize provider and Vectorizer secret visibility toggles so their icons stay centered instead of jumping vertically while pressed.

## 0.1.9 - 2026-07-27

- Keep long-running apps current with six-hour lifecycle-aware checks, bounded jitter, and shared single-flight coordination.
- Add deduplicated in-app update alerts, 24-hour reminders, and opt-in background system notifications.
- Localize the new updater experience across all five shipped languages and polish the Settings About footer.

## 0.1.8 - 2026-07-24

- Simplify troubleshooting recovery by keeping Reset UI state primary, collapsing diagnostic tools, and hiding unavailable Agent Host actions until a workspace is authorized.

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
- Kept message regeneration isolated from run-level recovery and Provider-tool retry contracts.

## 0.1.3 - 2026-07-22

- Superseded the unpublished `v0.1.2` release after its macOS DMGs correctly failed the notarization gate.
- Explicitly submit each signed macOS DMG for Apple notarization, wait for acceptance, staple its ticket, and verify Gatekeeper acceptance before upload.
- Align Windows and Linux updater verification and manifests with Tauri v2's signed native NSIS `.exe` and `.AppImage` artifacts.

## 0.1.2 - 2026-07-22

- Restored Retry for interrupted Agent runs after reopening a project, preserving the original brief and existing approval boundaries.
- Unified Design and Deliver navigation, refined the Git workspace drawer, and aligned compact integration icons.
- Added common custom provider protocol families and strengthened explicit model-routing coverage.
- Removed desktop Provider-operation auto-continue preferences so every Provider tool execution requires explicit approval.
- Added Developer ID signing, Apple notarization/stapling, four-platform updater verification, and hardened immutable GitHub Release publication.

## 0.1.1 - 2026-07-21

- Added signed in-app update discovery, download, install, and restart controls with a conditional Home update entry.
- Added atomic cross-platform GitHub Release publishing for Apple Silicon and Intel macOS, Windows x64, and Linux x64.
- Added local Git workflows, provider discovery, Creative Board delivery flows, and stricter Agent execution safety.
- Hardened approval leases, durable host ownership, controlled filesystem access, Tauri permissions, and release validation gates.
- Improved desktop scaling, Windows portability, generation-quality regression coverage, and Agent streaming behavior.

## 0.1.0 - 2026-07-20

- Added outcome-first multi-turn Agent runtime, governed Provider execution, and observable repair loops.
- Added Brand VI Kit, Design System Kit, component, starter, Registry, workflow pack, and unified delivery contracts.
- Added external Coding Agent CLI/MCP control and Design Governance evidence gates.
- Added Global Library source-blob projection and transactional macOS Registry installation.
- Added hardened macOS release configuration and truthful signing/notarization gates.
