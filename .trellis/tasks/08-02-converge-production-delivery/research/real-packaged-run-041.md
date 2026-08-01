# Real packaged VM run 041

## Authority

- VM: `cutout-e2e-run-041-converged`, cloned from the pristine macOS image.
- App: release bundle signed with Developer ID, Apple notarization submission
  `847af88c-ac2f-4f33-81bd-53eae24a89ac`, stapled, and accepted by Gatekeeper.
- Execution: packaged App GUI, native local-Agent credential discovery, native
  secret resolution, saved image Provider, casual chat, creative brief, real
  Provider image execution, and the complete prototype/resource pipeline.
- Durable sanitized evidence:
  `research/evidence/run-041-converged/{progress,result}.json`; the host source
  was `/private/tmp/cutout-vm-evidence/run-041-converged`.
- `progress.json` SHA-256:
  `d5545a118f9575f459f47f92aef6d1cec8e747f3348a8065b40433f53977ef2c`.
- `result.json` SHA-256:
  `0575abd70a2c955558644b96e3b14a9807e0218db1a3ab4a61eee9ffc2d2d4ff`.

## Terminal result

- Started: 2026-08-02 02:52:14 +0800, using the first host evidence write as
  the observable lower bound.
- Completed: 2026-08-02 03:49:58 +0800.
- Total observable duration: 57 minutes 44 seconds, compared with run 040's
  71 minutes 43 seconds (13 minutes 59 seconds faster).
- Both files report protocol `cutout.packaged-e2e-result.v1`, status `passed`,
  the same 59 phases, and terminal phase `resource-pack-ready`.
- Three Design Systems were already ready before the first joined monitor
  observation at 03:06:55, so their honest recorded upper bound is 14 minutes
  41 seconds. The protocol does not persist per-phase timestamps, so a more
  precise value is intentionally not invented.
- Selected-first `suite-1` was ready no later than 03:16:02 (+23:48), ahead of
  run 040's roughly +34-minute first complete suite by at least 10:12.
- `suite-2` was ready no later than 03:32:45 (+40:31).
- `suite-3` and terminal delivery were ready at 03:49:58 (+57:44).
- The later final comparison selected `suite-2` for viewing. This does not
  alter the earlier Design-System scheduling preference that produced
  `suite-1` first.

## Dynamic graph and paid work

- Agent-authored route/page counts: 7, 8, and 7; the route-graph digests are
  distinct for all three suites.
- Agent-authored reusable resource counts: 8, 8, and 8 for this brief. These
  counts came from each suite manifest and are not a product quota.
- Planned image calls: 50. Actual image calls: 50.
- Provider concurrency ceiling: 3. Suites remained serial because they share
  React, Asset Production, slice, and persistence state; page/resource waves
  used the existing bounded concurrency.
- One real transient third-suite failure occurred at pages `3/7`, resources
  `0/8`. Retry advanced directly to pages `4/7`; it did not replay the first
  three pages, either ready sibling, or the Design Systems.

## Delivery closure

All candidates are `ready`, all quality review states are `recorded`, the three
resource-pack IDs are distinct, and every suite has eight manifest bindings and
eight re-read artifacts. The content-addressed artifact verifier re-read each
local object and checked its production task/output binding, SHA-256, media
type, and dimensions before projecting the following `resourceArtifacts`
digests:

- `suite-1`: `e6d01666bec8c89b3aa584e82b216cb18758c8017c9d706f66598f70687dece5`
- `suite-2`: `07728a3e07dbc0ab32cddaf9de6bc43e717787373aed42ca63989ccdcd270398`
- `suite-3`: `cbae2e1190c23a9c53f98d5efe98a9bb6aaa181cb2c75da59aaa73422f638a97`

Each record also carries sanitized SHA-256 evidence for its Design System
image, `DESIGN.md`, CSS, Tailwind, token JSON, Design IR tokens, route graph,
page media, manifest, bindings, resource-pack identity, provenance, and review
document. No credential, prompt, Provider response, raw image bytes, or local
credential path is present in the terminal JSON.

## Final quality gates

- `pnpm agent:validate`: passed; 20 operations, 36 MCP tools, 20 product
  skills, and 168 bundled plugin source modules.
- `pnpm lint`: passed without warnings.
- `pnpm build`: passed, including TypeScript, Vite, Agent/skill validation,
  and the frontend bundle gate.
- Focused delivery/progress/resource/runner/rendered tests: 58 passed.
- Full Vitest: 1,925 passed and 15 skipped.
- Focused packaged Rust: 16 passed. Full Rust: 185 passed, one Apple Vision
  runtime test ignored, and three updater-signature tests passed.
- `cargo fmt --check`, release-version validation, release-authority
  validation, sanitized-evidence credential-shape scan, and
  `git diff --check`: passed.
- Full Playwright: 127 passed and nine expected skips. After all 136 cases
  reported, one Playwright worker remained in teardown; the test session was
  interrupted after its process tree was inspected, so the command exit was
  130 rather than zero. No assertion failed and the session process tree was
  cleared.
