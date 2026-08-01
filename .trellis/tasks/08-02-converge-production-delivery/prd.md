# Converge UI asset production delivery

## Goal

Make UI/UX asset production truthfully complete, independently verifiable, and
fast enough that a user can make useful decisions before the full paid graph
finishes. A run is complete only when every promised candidate has a closed
terminal state and every promised delivery bundle has inspectable provenance,
Design System projections, route/page outputs, resource-manifest bindings, and
quality evidence.

The optimization target is the user's outcome, not isolated implementation
metrics: remove work that does not create a required deliverable, overlap only
independent work under one provider budget, surface trustworthy remaining work,
and never report success from counts alone.

## Confirmed Facts

- Fresh packaged VM run 040 reached `resource-pack-ready` with three ready
  Design Systems, three distinct complete route suites, 44 planned and 44
  actual image calls, and one visible retry recovery.
- The same run took about 71 minutes 43 seconds. Three Design Systems were ready
  in about 11 minutes; complete candidate suites arrived at about 34, 53, and
  72 minutes.
- The optimized baseline already uses one paid invocation per page attempt,
  zero automatic QA rerolls, no paid text-free prepass, and provider concurrency
  three. Remaining wall time is dominated by provider latency across 44 required
  image calls rather than hidden duplicate DAG nodes.
- The terminal `result.json` was `passed`, while `progress.json` remained
  `running`. `src-tauri/src/commands/packaged_e2e.rs:165-179` hard-codes every
  progress write to `running` and `packaged_e2e_complete` does not close it.
- `src/components/workspace/IntentWorkspace.tsx:2901-3021` generates complete
  suite candidates sequentially. Normal product execution records one failed
  suite and continues; only packaged-E2E execution cancels unstarted siblings
  and breaks, so the benchmark currently diverges from product behavior.
- The persisted suite artifact already carries a validated Design System,
  complete plan/pages, resource-pack manifest, exact asset bindings, and
  provenance IDs. The E2E result projects only candidate status, routes, counts,
  and the selected suite's visible slice count, leaving delivery closure
  under-specified rather than requiring a new source of truth.
- Validated `DESIGN.md` already deterministically projects CSS variables,
  Tailwind theme values, token JSON, and Design IR tokens.
- The visible Agent surface provides elapsed time, cancellation, Retry, message
  regeneration, candidate comparison, and per-output queued/generating/failed
  states. It does not expose a trustworthy resolved-graph remaining-time
  estimate.

## Requirements

- Close packaged progress atomically with the same terminal status and phases
  as the validated result. A monitor must never observe terminal result success
  together with running progress after completion returns.
- Make packaged E2E exercise the same suite-failure isolation as production:
  one failed candidate must not cancel independent siblings, and Retry must
  resume only the failed completion frontier.
- Define one sanitized delivery-evidence projection per candidate that proves:
  Design System document and deterministic token projections exist; route/page
  topology is complete; every resource-manifest item has exactly one artifact
  binding whose local bytes match its completed production digest; provenance
  is non-empty; and quality review status is explicit.
- Require all promised candidate delivery projections, not only the selected
  candidate's visible slices, before terminal success.
- Add progressive production feedback derived from the resolved graph and
  observed completed work. It must distinguish completed, active, queued,
  failed, and retry-preserved nodes and avoid a fabricated precise ETA before
  enough observations exist.
- Reduce time to first decision and total completion without increasing paid
  request amplification. Candidate count, route count, page count, material
  count, and board grouping remain Agent-authored from user intent and domain
  needs; no fixed production quota may be introduced.
- Every candidate promised to the user must reach final fidelity with a complete
  independently deliverable resource pack, including candidates the user did
  not select. Preview-first execution must prioritize the selected direction and
  then continue every sibling to completion, but it may not redefine unselected
  candidates as previews-only or optional delivery.
- Keep provider concurrency under one explicit global ceiling. Increasing or
  adapting concurrency must be evidence-driven and must not create nested
  page-by-board amplification.
- Preserve `.cutout` Design IR and provenance as authority. E2E, receipts, UI,
  exports, and token files are projections and must not invent a parallel state.
- Keep secrets, prompt bodies, provider responses, and local credential paths
  out of progress and delivery evidence.
- Keep Agent manifest, CLI, MCP, protocol, plugin runtime, and docs synchronized
  if their externally visible contract changes; validate with
  `pnpm agent:validate`.

## Acceptance Criteria

- [x] A terminal packaged run writes matching `passed` or `failed` status to
      both result and progress, with regression coverage for atomic closure.
- [x] An injected transient failure in one suite leaves independent sibling
      candidates running/ready and Retry performs missing-frontier-only work.
- [x] The terminal outcome contains one sanitized, schema-validated delivery
      projection for every promised candidate; missing Design System/token,
      route/page, resource binding, provenance, or quality evidence rejects
      success.
- [x] Every candidate projection binds its Design System ID, route graph,
      resource-pack manifest identity, artifact count, and stable digests; the
      selected visible projection still matches the selected authority.
- [x] Production progress presents logical completed/total work and an honest
      estimate state (`collecting`, bounded range, or unavailable), with tests
      preventing negative, regressing, or false-precision estimates.
- [x] The optimized graph performs no more paid image calls than the compiled
      baseline and retains a single measured provider-concurrency ceiling.
- [x] Every promised candidate reaches final fidelity and owns an independently
      verifiable resource pack; early selection changes scheduling priority,
      never the required delivery set.
- [x] A realistic three-candidate benchmark produces an earlier useful decision
      checkpoint than run 040 and records total duration, per-stage duration,
      actual calls, concurrency, retries, and delivery evidence.
- [x] Existing cancellation, retry acknowledgement, suite restoration,
      Design-System selection, slicing, and resource-pack tests remain green.
- [x] `pnpm agent:validate`, lint, type-check/build, focused Vitest, Rust tests,
      browser gates, and `git diff --check` pass.

## Out Of Scope

- Coding generation and coding-backend delivery.
- Live Figma/Framer sync, cloud collaboration, web fetching, or video.
- Windows Authenticode procurement and external marketplace distribution.
- Commercial subscription limits for candidate count.
- Replacing the user's configured image provider or silently lowering final
  output quality to meet a synthetic latency target.
