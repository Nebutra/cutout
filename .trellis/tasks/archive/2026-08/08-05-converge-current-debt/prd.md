# Converge current production debt

## Goal

Turn the remaining post-v0.1.19 audit debt into a bounded, observable and
truthful UI/UX asset-production path. A run must either deliver the complete
planned asset set or stop with a stage-specific, actionable failure; reaching
planning or displaying an indefinite spinner is not completion.

## Requirements

- Production workflow stages expose durable progress and elapsed-time evidence
  sufficient to identify the active unit of work and distinguish slow work from
  a stalled request.
- Every remote planning/image request has a finite deadline, bounded retries,
  cancellation propagation and a sanitized terminal error.
- Retry policy follows failure semantics: transient transport/server failures
  may retry with bounded backoff; validation, capability and client errors fail
  immediately.
- Provider image-edit support is selected from reviewed capability evidence and
  protocol compatibility, not a provider-name allowlist. Model quality affects
  recommendation, not whether an otherwise compatible adapter is hidden.
- Unsupported request options such as `input_fidelity` can be omitted or
  downgraded from conformance evidence without weakening the requested outcome.
- The automated production proof covers route planning, design-system output,
  all planned prototype pages, deconstruction/slicing, provenance and final
  asset-package readiness. It must not use fake bitmap decoding at the delivery
  boundary.
- Route/page/material counts remain Agent decisions derived from business intent
  and quality constraints. No fixed page or per-page asset quota is introduced.
- Remove the unused local session query/service scaffold; backward compatibility
  is not required for this unconsumed interface.
- Replace generic frontend specification placeholders with conventions evidenced
  by the current repository.
- Remediate resolvable high/medium dependency alerts without weakening lockfile
  integrity or forcing an incompatible Tauri/GTK stack.
- Preserve the Agent capability contract, Design IR authority, approval policy,
  native secret boundary and current truthful integration limitations.

## Acceptance Criteria

- [x] UI progress identifies the current stage/unit, completed and total work,
      elapsed time, and retry state while production is active.
- [x] Stage inactivity and request deadlines terminate with a typed, sanitized
      error and leave retry/cancel controls in a coherent state.
- [x] Focused tests prove transient retry, non-retryable failure, timeout,
      cancellation and progress transitions.
- [x] An automated end-to-end production test reaches final delivery with real
      bitmap encode/decode behavior and verifies every Agent-planned page and
      reusable asset appears in the delivered package.
- [x] Provider conformance tests cover an OpenAI-compatible edit model that
      accepts `input_fidelity`, one that rejects it, and a non-OpenAI reviewed
      image-edit adapter without provider-name special casing.
- [x] The terse-brief Tool Gate does not block a safe production request merely
      because the user did not write a PRD.
- [x] No source imports or registry fields remain for `useSession`,
      `SessionService`, `sessionKeys` or the local session implementation.
- [x] Frontend spec index and generic guides contain no placeholder status/text.
- [x] `pnpm audit --prod`, applicable Dependabot alert checks, frontend quality
      gates, Rust checks, `pnpm agent:validate`, i18n and release contracts pass,
      or an upstream-only dependency exception is documented with exact evidence.
- [x] Documentation distinguishes deterministic automated delivery proof from
      opt-in real-Provider evidence and does not claim an unexecuted live run.

## Notes

- The 2026-08-05 real-model experiment is the baseline failure evidence: two
  runs planned two pages and then stayed in `design-system` for 843 seconds.
- ImageMagick remains benchmark-only unless new measured evidence reverses the
  existing slicing conclusion.
- `Coming soon`, `host-required` and `adapter-required` remain valid truthful
  capability states and are outside cleanup scope.

## Verification evidence

- Deterministic complete-delivery E2E passed all seven cases. The selected
  result contains three Design Systems, three differing route suites, 18 total
  Agent-planned pages, every planned reusable material, resource packs and
  provenance. Bitmap encode/decode and browser slicing are real; Provider
  responses are deterministic reviewed fixtures.
- Full Vitest passed 2,039 tests with 15 intentional skips; locked Rust tests
  passed 211 tests with one ignored test. Build, lint, TypeScript, i18n, Agent
  contract, Cargo check/format and both JavaScript audit scopes passed.
- Standard `pnpm test:visual` passed 129 tests with five intentional skips in
  2.0 minutes using four Playwright-matched Chromium workers. The fixture no
  longer races IndexedDB autosave or performs a redundant reload.
- Opt-in real evidence is limited to the terse-brief Tool Gate and a successful
  `gpt-image-2` edit request (22.5 seconds). A complete live-Provider production
  pipeline and local Linux/Windows native matrices were not run, and are not
  represented as passing here.
- `glib@0.18.5` remains an upstream Tauri/Linux GTK ABI-family constraint with
  its exact chain and upgrade conditions recorded in `docs/DEPENDENCY_SECURITY.md`.
