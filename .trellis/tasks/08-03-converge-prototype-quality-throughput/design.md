# Technical design

## First-principles boundaries

The pipeline has four independent truths:

1. A configured image endpoint, an edit-capable model, and a high-quality model
   are three different facts.
2. A complete artifact may need attention without being corrupt.
3. Human selection is durable product intent and must outrank background
   scheduling preference.
4. Concurrency is valid only where the state and Provider budgets have one
   enforceable owner.

The implementation assigns one owner to each truth instead of scattering
special cases through `IntentWorkspace`.

## Image support and recommendation

Replace the prototype hard allowlist with a shared route assessment that has
two independent outputs:

- executable capabilities: the intersection of exact model capability evidence
  and implemented Provider adapter capabilities;
- fidelity tier: `recommended` or `compatible`, used only for routing preference
  and user guidance.

The generic capability router remains the authority for support. Strengthen its
runtime inputs so image capability is model-evidence-backed rather than granted
to every model under one Provider kind. `supportsOpenAIImageEndpoints` keeps its
narrow meaning as the OpenAI adapter predicate; it is not the global edit
capability check.

Reviewed model evidence is Provider-neutral. The exact model id and capability
are projected only when the authenticated catalog for the configured Provider
contains that id. The 2026-07-25 Image Edit Arena roster supplies reviewed edit
evidence but no generation, transport, or recommendation claim. Manual Provider
verification and automatic setup both use this projection; the resulting
descriptor is then intersected with the separately owned adapter strategy.

Generation and editing retain separate task bindings through automatic setup,
desktop paid-tool capability projection, and prototype execution. Reference-
conditioned work selects the verified edit route first and falls back to the
generation route only when that same route also has executable edit capability.
The legacy singular image assignment remains a compatibility fallback.

Desktop paid capability projection, Design System conditioning, and page
generation consume the same route assessment. When edit is executable, visual
references flow through that adapter. When generation is executable but edit
is not, generation remains available and the UI explains the fidelity trade-off.
When no adapter is executable, preflight returns `capability-required` before
approval or charge.

Automatic setup ranks supported routes by fidelity preference but does not
discard compatible routes. Exact model ids remain unchanged for verification
and transport. A Provider-specific adapter is added only where its actual API
shape can be implemented and covered; no Provider is made "OpenAI-style" merely
to unlock editing.

## Review evidence contract

Define a strict versioned page review record next to the existing QA verdict
schema. It contains the page artifact SHA-256, reviewer provider/model, verdict,
failures, and ISO timestamp. `PersistedPrototypePage` gains an optional review
field for backward compatibility.

`generatePrototypePageSet` changes its review callback from observational
`Promise<void>` to a transformation that returns the reviewed artifact. Inline
review publishes the transformed artifact immediately. Overlapped review may
publish the unreviewed progress preview, but replaces it before the page set can
resolve; downstream production sees only final reviewed artifacts.

Resource-pack bindings gain a versioned review projection copied from the
authoritative completed production task. It includes the artifact id, QA
verdict, observational issue codes/messages, and Provider route. Integrity
continues to be enforced by Asset Production and the content-addressed verifier.

Delivery evidence validates all new page/resource review records, aggregates a
truthful status, and hashes the review projection. `reviewDocument` remains a
separate planning artifact digest and no longer stands in for image QA.

## Selection ownership

Keep a synchronous ref containing the latest validated suite selection. The UI
selection handler updates it before asynchronous resource restoration. Every
orchestration publish merges that selection when the candidate remains ready.
Terminal Agent selection runs only when the ref has no valid human selection.
Starting a fresh candidate set resets the ref; retrying the same set preserves
it.

This avoids a second mutable candidate-set authority while closing the stale
closure between React state and the local orchestration accumulator.

When a human selection exists, candidate-local sibling work may update its own
frontier and artifact, but it must not write that sibling into the singular
plan/Design System/pages projection. Because Asset Production currently has one
global active run, restore the selected resource-pack authority after sibling
production settles. A later architecture may split executing and selected run
ids; this task must at least keep the selected projection coherent.

## Partial candidate isolation

Candidate generation remains all-settled. If at least one Design System is
ready, transition to selection even when the full proposal is incomplete.
Failed siblings remain in the same candidate set with their errors. Selecting a
ready candidate proceeds selected-first; later incomplete suite alternatives
remain explicit retryable partial delivery rather than blocking inspection of
ready work.

## Throughput scheduling

Do not parallelize complete suites. Within one suite, represent direct tasks and
board-page groups as production work items consumed by one bounded scheduler of
three workers. Each work item retains its existing task-local error handling and
evidence writes. This removes the direct-before-board barrier without allowing
six simultaneous image calls.

The scheduler is a small generic module with deterministic ordering and a unit
test that holds one class of work open while proving the other starts and the
combined active count never exceeds the configured ceiling.

## Compatibility and rollback

- Existing persisted pages/resource packs decode without review evidence.
- Existing artifacts remain viewable, but terminal delivery proof fails closed
  until the missing review evidence is regenerated.
- No CLI/MCP claim is broadened. Desktop capability projection becomes more
  precise and the Agent capability contract is validated because the desktop
  execution surface is affected.
- Each layer is independently revertible: eligibility gate, review evidence,
  selection merge, candidate availability, and scheduler wiring.
