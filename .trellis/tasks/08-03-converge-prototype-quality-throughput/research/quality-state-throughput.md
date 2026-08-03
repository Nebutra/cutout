# Quality, state, and throughput research

## Scope and conclusion

This note covers page/resource QA evidence, Design System and prototype-suite
selection authority, Asset Production projection authority, and safe production
throughput. Model eligibility is owned by the sibling `model-eligibility.md`
research.

The pipeline already has the correct resource-QA policy: observational model
findings remain visible warnings while integrity failures block delivery. The
main correctness gaps are elsewhere:

1. page QA is awaited but discarded, while terminal evidence labels a planning
   review document as a recorded quality review;
2. a human suite selection can be overwritten by the producer's stale local
   candidate set and by terminal auto-selection;
3. the selected suite projection and the currently executing production run
   share one global authority;
4. ready Design System directions are artificially unselectable after a sibling
   fails; and
5. direct assets and board work use separate sequential pools, creating a full
   phase barrier.

Complete suites must remain serial in this task. The safe throughput gain is a
single bounded scheduler inside one suite, not parallel suite orchestration.

## 1. Page QA evidence is not durable or truthful

### Current flow

- `PersistedPrototypePage` stores only page metadata and raster data; it has no
  review receipt (`src/workspace/workspace-snapshot.ts:39-58`).
- The runtime page artifact simply extends that persisted shape
  (`src/prototype/prototype-artifact-recovery.ts:18-20`). Recovery validates
  media and reconstructs a Blob, but has no QA evidence to validate or restore
  (`src/prototype/prototype-artifact-recovery.ts:64-92`, `157-161`).
- `generatePrototypePageSet` accepts `review: (artifact) => Promise<void>`.
  Inline and overlapping modes join review completion, and tests correctly
  cover overlap, inline blocking, final joining, and no re-review of recovered
  pages (`src/prototype/page-generation.test.ts:89-218`). The callback cannot
  return a reviewed artifact, so no verdict reaches persistence.
- `reviewPrototypePage` obtains the actual `QaVerdict`, logs rejection, and
  returns `void` (`src/components/workspace/IntentWorkspace.tsx:4571-4592`).
- `persistPrototypePage` consequently persists only image data and `page`
  (`src/components/workspace/IntentWorkspace.tsx:8818-8824`). This affects both
  the singular workspace pages and candidate-local suite pages
  (`src/components/workspace/IntentWorkspace.tsx:1269-1270`, `3037-3039`).

The terminal evidence is therefore false by construction. It requires
`plan.reviewDocument` (`src/prototype/delivery-evidence.ts:64-67`), emits the
literal `qualityReviewStatus: 'recorded'`, and hashes only that planning
document (`src/prototype/delivery-evidence.ts:132-158`). The packaged runner
validates the literal and digest shape, not page-QA execution or verdict
coverage (`src/packaged-e2e/runner.ts:624-680`). Existing delivery tests codify
the same substitution (`src/prototype/delivery-evidence.test.ts:12-56`).

### Required contract

Add an optional, versioned review record to `PersistedPrototypePage` so legacy
pages remain recoverable. A new page review must contain at least:

- the SHA-256 digest of the exact page bytes;
- the reviewer provider/model route;
- the complete verdict (`pass`, `unavailable`, and failures);
- a review timestamp; and
- a schema version.

The digest is essential. Page identity alone would let a stale verdict survive
regeneration. Recovery should keep legacy pages without a review, but validate
present receipts and reject or mark stale any receipt whose digest does not
match the recovered bytes.

Change `generatePrototypePageSet.review` from a side-effect callback to an
artifact transformation. Inline mode publishes only the reviewed artifact.
Overlap mode may expose unreviewed progress as a nonterminal preview, but it
must replace that entry with the reviewed artifact before the function
resolves. Downstream production must receive the final reviewed collection.
Recovered artifacts remain exempt from automatic re-review, preserving the
current retry behavior.

Delivery evidence should validate exact review coverage for every new page,
digest a canonical page-review projection separately from `reviewDocument`,
and aggregate:

- `passed` only when every page and resource review passed;
- `attention-required` when any review rejected or was unavailable; and
- no terminal quality proof when a required new receipt is absent or stale.

`reviewDocument` remains useful planning evidence and should keep its own
digest. It must not stand in for image QA.

## 2. Resource QA warning semantics are correct

Direct-asset generation persists the actual QA verdict and converts rejection
or unavailability into an `observationalIssue`
(`src/components/workspace/IntentWorkspace.tsx:3617-3647`). Board production
does the same for missing/rejected QA and deterministic background findings
(`src/components/workspace/IntentWorkspace.tsx:3822-3850`), then retains those
warnings on the published task (`src/components/workspace/IntentWorkspace.tsx:3906-3942`).

That behavior agrees with the quality policy and must not be reversed:

- observational issues are warnings, not blockers
  (`src/asset-production/quality-policy.ts:47-53`);
- warnings allow review acceptance and verified readiness
  (`src/asset-production/reducer.ts:190-218`); and
- a run completes only when all required tasks are consumable
  (`src/asset-production/reducer.ts:249-266`).

Integrity failures still fail closed: missing sources, generation or
persistence failures, empty/ambiguous board slots, missing candidate sources,
and decode/slice failures never become warnings. Completed resource-pack
verification also resolves the exact run, reloads content-addressed bytes, and
checks digest/media binding (`src/prototype/resource-pack-production.ts:21-40`,
`63-113`).

The missing piece is delivery projection. Extend each persisted resource-pack
binding with a versioned review projection copied from its authoritative
completed task: artifact id, Provider route, QA verdict, and relevant
observational issue codes/messages. Bind it to the same content-addressed
artifact id. Terminal evidence then validates and hashes this projection along
with the already re-read resource bytes.

Do not turn review rejection into a paid reroll or `needs-review`. A rejected
but integral resource is `attention-required`, not incomplete.

## 3. Design System partial failure is blocked above the domain layer

The reusable selection contracts already permit the intended behavior:

- `selectPrototypeDesignSystemCandidate` requires only that the selected
  candidate is ready and has an artifact
  (`src/prototype/design-system-candidates.ts:139-161`).
- Candidate-set validation requires a human only when multiple candidates are
  ready; it does not require every proposed sibling to be ready
  (`src/candidate-selection/contracts.ts:142-173`).

The workspace adds a contradictory all-ready gate. The handler rejects unless
ready count equals proposal count
(`src/components/workspace/IntentWorkspace.tsx:2069-2078`), and the comparison
UI makes every card read-only under the same condition
(`src/components/workspace/IntentWorkspace.tsx:7593-7639`). The rendered
regression explicitly expects all buttons to be disabled after statuses
`ready, failed, ready` (`src/components/workspace/prototype-all-routes.e2e.test.tsx:893-942`).

Remove the workspace-level all-ready requirement once candidate execution has
settled. Any ready card should be selectable, failed cards must remain visible,
and Retry must target failed candidates without regenerating ready siblings.
Do not auto-select merely because only one candidate succeeded: a
multi-direction proposal still requires a human decision. Zero ready candidates
remains blocking.

The selection-required projection at
`src/components/workspace/IntentWorkspace.tsx:642-648` also uses the all-ready
condition and should instead reflect settled execution plus at least one ready
candidate. The canvas already renders the comparison whenever at least one
ready candidate exists (`src/components/workspace/IntentWorkspace.tsx:7070-7082`).

## 4. Human suite selection races the serial producer

The multi-suite producer keeps a mutable local `suites` value and publishes
whole replacements (`src/components/workspace/IntentWorkspace.tsx:2913-2929`).
It then produces candidates serially and repeatedly derives updates from that
local snapshot (`src/components/workspace/IntentWorkspace.tsx:2948-3067`).

Ready suite cards are selectable while later siblings are still generating
(`src/components/workspace/IntentWorkspace.tsx:7897-7905`). The UI handler
selects from React state, waits for resource restoration, then updates the
candidate set and singular projection
(`src/components/workspace/IntentWorkspace.tsx:2119-2142`). The producer's
local `suites` never receives that selection, so its next whole-state publish
can erase it. When production finishes, orchestration unconditionally selects
the suite matching the originally selected Design System direction
(`src/components/workspace/IntentWorkspace.tsx:3081-3107`), which can overwrite
an interim human choice a second time.

Use one monotonic selection authority:

1. Keep a synchronous ref for the latest validated suite selection.
2. Update the ref immediately when the user clicks, before awaiting resource
   restoration.
3. Merge that selection into every producer publish if the selected candidate
   remains ready and its artifact remains present.
4. Terminal Agent selection runs only if there is no valid human selection.
5. Reset the ref only for a genuinely fresh candidate set; preserve it for a
   retry of the same set.

The ref closes the stale closure without creating another persisted candidate
set. `prototypeSuiteCandidates` remains the durable state, and its selection
receipt remains the Design IR provenance authority.

Selection restoration should remain strict. It already recovers complete page
media, resolves the resource pack to its completed production run, reloads
every bound artifact, rebuilds slices, and selects that run
(`src/components/workspace/IntentWorkspace.tsx:2127-2142`, `2150-2224`).

## 5. Executing and selected production authorities are conflated

Starting an Asset Production run sets the global `activeRunId`
(`src/asset-production/reducer.ts:57-81`). Starting a different run supersedes
the previous nonterminal authority (`src/asset-production/coordinator.ts:10-39`).
Workspace production status and review queue use the global current run
(`src/components/workspace/IntentWorkspace.tsx:799-809`), and slice/export
selectors filter through that same authority (`src/store/selectors.ts:32-75`).

Suite restoration correctly changes the authority to the selected suite's
resource-pack run. But if a sibling subsequently begins production, it becomes
the global active run and selected materials/status can drift to that producing
sibling. This is the same root cause as the suite-selection race: execution
progress and user projection are represented by one id.

There is also an immediate optimistic-concurrency failure when selection occurs
during sibling resource production. `selectResourcePackProductionAuthority`
increments the shared revision and replaces `activeRunId`
(`src/prototype/resource-pack-production.ts:43-60`). The in-flight producer's
`commitProduction` still expects its previous local revision and throws when
the store has changed (`src/components/workspace/IntentWorkspace.tsx:3399-3404`).
Thus the required interaction can both move the visible projection and abort a
sibling that was otherwise progressing normally.

For this task, keeping complete suites serial avoids the more severe revision
and cancellation conflicts, but it does not by itself make interim selection
stable. The minimum safe implementation must ensure background producer
updates do not overwrite the selected singular plan/design/pages and must
avoid mutating the producer's execution authority merely to project a selected
completed run. The durable shape is to split `executingRunId` from
`selectedRunId`, with UI and export selectors using the selected run while
production coordination and optimistic revision commits use the executing run.
If that split is staged, selection must at least verify and remember the exact
completed run without changing the active producer revision, then install the
selected projection once the producer reaches a safe boundary.

The workspace persistence effect snapshots singular plan/design/pages and the
candidate set together on every change
(`src/components/workspace/IntentWorkspace.tsx:1255-1318`). Design IR persists
both Design System and suite candidate sets, plus distinct human selection
provenance (`src/design-ir/legacy-projection.ts:531-580`, `624-635`). Therefore
an overwritten selection can become a durable provenance error, not just a
temporary display glitch.

The producer also writes every sibling's in-progress plan/design/pages into the
singular selected projection (`src/components/workspace/IntentWorkspace.tsx:3008-3011`),
and page progress keeps replacing the global pages
(`src/components/workspace/IntentWorkspace.tsx:4446-4460`, `4503-4517`). Once a
human selection exists, these writes should update candidate-local progress
only. Singular fields must remain a projection of the selected suite.

## 6. Throughput has a removable phase barrier

Within one suite, all direct tasks run through a pool of three and are fully
awaited (`src/components/workspace/IntentWorkspace.tsx:3510-3696`). Only then
does board production begin through a separate page pool of three
(`src/components/workspace/IntentWorkspace.tsx:3698-3711`). Board groups are
serial within each page (`src/components/workspace/IntentWorkspace.tsx:3758-3759`).

This creates an avoidable critical path:

```text
all direct assets (<=3) -> all board pages (<=3 pages, 1 group/page)
```

Direct and board work are independent once pages and the Design System exist.
The safe schedule is:

```text
deterministic mixed work list -> one scheduler with 3 workers
                              -> direct task work item
                              -> board-page/group work item
```

Use one limiter for every image-producing work item. Two separate pools running
concurrently would permit up to six Provider calls and violate the global
ceiling. Preserve task-local error handling, deterministic work ordering,
exact call ids/accounting, resource attribution, and retry target filtering.

Existing tests are insufficient. The source test only proves that board work
uses a bounded pool (`src/prototype/production-throughput.source.test.ts:28-39`),
and the rendered E2E proves a peak board concurrency of three and exact total
call counts (`src/components/workspace/prototype-all-routes.e2e.test.tsx:823-847`).
Neither test proves direct/board overlap or a combined ceiling.

Do not parallelize complete suites. The suite loop is intentionally serial
(`src/components/workspace/IntentWorkspace.tsx:2948-3067`), and each suite
shares the global Asset Production revision, active run, slice projection, and
singular React state. Cross-suite concurrency would add cancellation and lost
commit races before those authorities are isolated.

## Recommended implementation order

1. Add page and resource review evidence schemas and backward-compatible
   recovery first. This establishes truthful artifact contracts before changing
   orchestration.
2. Make page review transform artifacts, join overlapping review results, and
   persist exact-byte receipts.
3. Replace unconditional delivery quality status with validated aggregation and
   distinct page/resource review digests.
4. Add synchronous, monotonic human suite-selection ownership; merge it into
   producer publishes and prevent terminal Agent override.
5. Stop background sibling progress from replacing the selected singular
   projection; keep restoration bound to the selected resource run.
6. Permit settled partial Design System selection while preserving failed
   siblings and targeted Retry.
7. Replace the direct-before-board barrier with one mixed scheduler capped at
   three. Keep complete suites serial.

Model eligibility preflight should land before any paid generation, as specified
by the sibling research and task plan, but it is independent of the ordering
above.

## Required regression coverage

- Page review persistence: receipt survives workspace and Design IR round trip;
  its digest matches exact bytes; stale digest and missing new receipt fail
  terminal proof; historical missing receipt remains viewable.
- Page review concurrency: inline and overlap modes return only reviewed final
  artifacts; overlapping progress is replaced before resolution; reused pages
  are not reviewed again.
- Delivery aggregation: all-pass yields `passed`; rejected or unavailable page
  or resource QA yields `attention-required`; planning `reviewDocument` alone
  cannot satisfy quality proof.
- Resource integrity: observational warnings remain consumable while missing,
  ambiguous, undecodable, or content-mismatched artifacts remain blocking.
- Partial Design System selection: statuses `ready, failed, ready` leave ready
  buttons enabled, failed details visible, Retry available, and require a human
  choice.
- Suite selection race: pause a later sibling mid-generation, select the first
  ready suite, release the sibling, and assert the final candidate-set receipt,
  singular plan/design/pages, selected production run, slices, and Design IR
  provenance all still name the human-selected suite.
- Mixed scheduling: hold a direct item open and prove board work starts (and the
  inverse), while a shared active counter never exceeds three.
- Retry preservation: a failed work item repeats only its logical node; ready
  pages, resources, Design System candidates, and suite candidates are not
  replayed; planned calls equal baseline plus observed repeat attempts.

## Non-goals and guardrails

- Do not reintroduce blocking quality issues for observational model findings.
- Do not add automatic paid QA rerolls.
- Do not weaken content-addressed resource verification.
- Do not disable interim suite selection to hide the race; the required UX is
  selection while siblings generate.
- Do not parallelize complete suites until Asset Production, slice, and singular
  projection authorities are isolated per suite.
- Do not introduce fixed candidate, route, page, or material counts.
