# State Management

> How state is managed in this project.

---

## Overview

<!--
Document your project's state management conventions here.

Questions to answer:
- What state management solution do you use?
- How is local vs global state decided?
- How do you handle server state?
- What are the patterns for derived state?
-->

(To be filled by the team)

---

## State Categories

<!-- Local state, global state, server state, URL state -->

(To be filled by the team)

---

## When to Use Global State

<!-- Criteria for promoting state to global -->

(To be filled by the team)

---

## Server State

<!-- How server data is cached and synchronized -->

(To be filled by the team)

---

## Common Mistakes

<!-- State management mistakes your team has made -->

(To be filled by the team)

---

## Persisted Artifact Recovery

Workspace persistence and UI readiness are a cross-layer projection:

```text
persisted workspace.v1 -> recovery boundary -> runtime artifacts -> UI/outcome/repair
```

The recovery boundary owns normalization. Components must consume its typed projection
instead of independently interpreting persisted fields.

### Artifact Existence And Semantic Health Are Independent

A visual artifact's existence is determined only by its persisted media contract (non-empty
bytes and valid dimensions). Semantic companion data such as `DESIGN.md` frontmatter or
tokens is a separate, derived health axis.

Required pattern:

```ts
const projection = projectPrototypeArtifacts({ designSystem, pages })
const hasVisual = Boolean(projection.designSystem)
const hasPortableDesignMd = projection.hasValidDesignMarkdown
```

Forbidden pattern:

```ts
// A documentation problem must never erase a recoverable visual.
if (designSystemMarkdownValidationError(artifact.designMarkdown)) return null
```

### Single Projection Rule

- Restore, canvas status, outcome evidence, and repair planning must use the same projection.
- Diagnostics are derived from the current artifact and are not persisted or copied into a
  second mutable React/Zustand field.
- A ready visual with unhealthy documentation remains selectable and visible. The UI may show
  a non-blocking health message; it must not represent the visual as queued or missing.
- Design IR projections must preserve intrinsic raster dimensions. Never manufacture `0x0`;
  store dimensions on content references and recover older references from raster headers.
- If dependent outputs survive but an upstream artifact is genuinely missing, preserve the
  outputs as evidence and mark the outcome incomplete. Do not delete valid bytes to make the
  graph appear consistent.

### Testing Requirements

Every recovery change must cover:

- valid media + valid companion document;
- valid media + invalid/missing companion document;
- invalid media + valid dependent artifacts;
- round-trip compatibility with existing `workspace.v1` records;
- at least one consumer assertion proving UI/outcome/repair uses the shared projection.

This contract prevents the historical state where restart recovery discarded a design-system
visual for invalid YAML while independently restoring prototype pages as ready.

## Scenario: Persisted Design System Candidates

### 1. Scope / Trigger

Apply whenever Design System candidate generation, workspace persistence,
legacy Design IR projection, candidate selection, or Design Kit consumption
changes.

### 2. Signatures

```ts
interface WorkspaceSnapshot {
  readonly prototypeDesignSystem: PersistedPrototypeDesignSystem | null
  readonly prototypeDesignSystemCandidates?: {
    readonly set: CandidateSet
    readonly artifacts: Readonly<Record<string, PersistedPrototypeDesignSystem>>
  } | null
}

function recoverPrototypeDesignSystemCandidateSet(
  persisted: PersistedPrototypeDesignSystemCandidateSet | null | undefined,
  legacySelected?: PersistedPrototypeDesignSystem | null,
): PrototypeDesignSystemCandidateSet | null

function migratePersistedPrototypeDesignSystemCandidateSet(
  persisted: PersistedPrototypeDesignSystemCandidateSet,
): PersistedPrototypeDesignSystemCandidateSet
```

### 3. Contracts

- `prototypeDesignSystemCandidates.set` is the generic grouping/selection
  contract. `artifacts` is a workspace compatibility cache for binary bytes;
  Design IR materials and content references remain authoritative.
- `prototypeDesignSystem` remains the selected singular projection consumed by
  existing page and production code. It must never point at an unselected
  candidate.
- Ready candidates project to distinct `design-system` and `design-markdown`
  materials with candidate provenance. The selection receipt gets its own
  provenance record.
- Only the selected candidate's validated `DESIGN.md` projects to Design IR
  tokens. Design Kit receives the exact selected Markdown material binding;
  CSS, Tailwind, JSON, and theme outputs derive from the corresponding tokens.
- Historical singular workspaces recover as one selected candidate without
  rewriting their image, Markdown, pages, or current downstream behavior.
- Early candidate-aware workspaces may persist the compatibility candidate with
  canonical `material:design-system` / `material:design-markdown` output aliases.
  Normalize that exact historical shape at the persistence recovery boundary to
  candidate-scoped material IDs before runtime recovery or Design IR projection.
  Current candidate generation must never emit the canonical aliases.
- The migration must be narrow and idempotent: only the known legacy set,
  revision, candidate, selection, and output-role combination is rewritten.
  Malformed or unrelated candidate sets remain subject to normal schema failure
  and must not be guessed into a valid state.
- Compilers and persisted-manifest validators compute document fingerprints
  from `validateDesignDocument(...).data.document`, because additive defaults
  such as `candidateSets: []` are part of the normalized cross-compiler
  contract. Semantic declaration checks may still inspect the caller-authored
  relation set when legacy materialization would hide a missing declaration.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Persisted candidate set fails schema validation | ignore the candidate wrapper; preserve recoverable singular/page media |
| Ready candidate lacks artifact bytes | do not expose it as selectable |
| Candidate output references missing material/provenance | Design IR validation fails closed |
| Selected Markdown hash/revision differs from material | Design Kit compilation fails closed |
| Legacy singular system exists without candidate field | wrap as one selected compatibility candidate |
| Early persisted compatibility candidate uses canonical material aliases | rewrite both outputs to candidate-scoped IDs before projection; preserve artifacts and selection |
| Unrelated candidate uses a canonical-looking material ID | do not apply the historical migration; validate/fail through the normal contract |
| Unselected multi-direction set reloads | restore `design-system-selection`, not `idle` |
| Two compilers fingerprint raw vs normalized IR | reject as drift; update both to fingerprint the validated normalized document |

### 5. Good / Base / Bad Cases

- Good: two candidates persist, one is selected, tokens and exports bind to its
  Markdown, and both directions remain inspectable after reload.
- Base: an old project with one system restores exactly as before through a
  one-candidate selected wrapper.
- Base: an early persisted wrapper using canonical aliases restores with one
  canonical selected projection plus distinct candidate materials, with no
  duplicate IDs and unchanged artifact bytes.
- Bad: the UI stores candidate bytes but Design IR still contains only a
  mutable alias with no grouping, provenance, or selected token lineage.

### 6. Tests Required

- Candidate runtime unit tests for status updates and human/Agent selection.
- Workspace fingerprint and repository round-trip coverage for candidate state.
- Legacy projection coverage for candidate materials, selection provenance,
  selected tokens, and workspace reconstruction.
- Persistence-boundary coverage for the exact early canonical-alias record,
  idempotent round trips, distinct candidate material IDs, and a Design IR
  uniqueness assertion proving the canonical selected material appears once.
- Compiler coverage proving exact selected `DESIGN.md` emission and SHA/revision
  rejection.

### 7. Wrong vs Correct

```ts
// Wrong: every generated direction becomes downstream authority.
tokens = candidates.flatMap(projectTokens)

// Wrong: let a persisted compatibility candidate reuse canonical material IDs.
const unsafeRecovered = persistedCandidateSet

// Correct: selection controls the singular projection and token lineage.
const artifact = artifacts[candidateSet.selection.candidateId]
tokens = projectDesignMarkdownTokens(parseEditableDesignMarkdown(artifact.designMarkdown), {
  provenanceId: candidateSet.selection.provenanceId,
})

// Correct: normalize historical aliases once before any consumer projects them.
const recovered = migratePersistedPrototypeDesignSystemCandidateSet(persistedCandidateSet)
```

## Scenario: Retiring A Persisted UI Capability

### 1. Scope / Trigger

Use this contract when a localStorage-backed preference, route, inspector, or capability is
removed from the product UI. Compatibility belongs at the persistence boundary; removed state
must not remain in React props, component branches, or current runtime types.

### 2. Signatures

```ts
migrateWorkspaceNavigation(input: unknown): WorkspaceNavigation
saveWorkspaceNavigation(
  value: WorkspaceNavigation,
  storage?: Pick<Storage, "setItem">,
): void
```

### 3. Contracts

- `cutout.workspace-navigation.v2` stores only the current `WorkspaceNavigation` schema.
- The current shape is `{ version: 2, mode, inspector? }`; removed capability flags are not
  optional compatibility fields on the runtime type.
- `migrateWorkspaceNavigation` may recognize retired fields or route names as input only, then
  returns a current value that cannot reopen the removed surface.
- The next normal save rewrites migrated state in the current schema.

### 4. Validation & Error Matrix

- Current valid value -> preserve the value.
- Retired boolean capability with a current route -> drop the boolean and preserve the route.
- Retired inspector or route -> return the normal Canvas navigation.
- Malformed JSON or unknown mode -> return the normal Canvas navigation.
- Attempt to save a retired or extra field -> current Zod schema rejects it.

### 5. Good/Base/Bad Cases

- Good: `{ version: 2, mode: "canvas", inspector: "figma" }` round-trips unchanged.
- Base: `{ version: 2, mode: "agent", advanced: true }` migrates to Agent without `advanced`.
- Bad: `{ version: 2, mode: "canvas", inspector: "receipts", advanced: true }` must not expose
  a hidden audit surface; it migrates to Canvas without an inspector.

### 6. Tests Required

- Unit-test current round trips, retired flag removal, every retired inspector, malformed JSON,
  and invalid modes at the shared migration boundary.
- Assert serialized output contains only current fields.
- Update component and visual tests so no removed control, route, or dialog remains reachable.

### 7. Wrong vs Correct

Wrong: keep `advanced?: boolean` in `WorkspaceNavigation` and let each component ignore it.

Correct: remove `advanced` from the current schema and normalize old records once in
`migrateWorkspaceNavigation`.

## Scenario: Atomic Project Transitions With Native View Transitions

### 1. Scope / Trigger

Apply whenever creating, opening, restoring, or closing a project coordinates
the global workspace store with a keyed React project surface while the browser
View Transition API is enabled.

### 2. Signatures

```ts
function withViewTransitionApplied(update: () => void): Promise<void>

async function newProject(): Promise<LocalProjectRecord>
async function openProjectById(id: string): Promise<void>
```

### 3. Contracts

- `document.startViewTransition(callback)` does not guarantee that `callback`
  runs before `startViewTransition` returns. Callers that write dependent state
  must await `withViewTransitionApplied`.
- Store reset/restore and the reducer action that changes `projectVersion` run
  in the same transition callback. This prevents an old `IntentWorkspace`
  instance from observing the new project's state and prevents a new instance
  from mounting against stale state.
- Home brief bootstrap, attachment ingestion, and `requestAgentRun` happen only
  after the new-project reset and keyed mount transition have applied.
- `restoringRef` remains active until the transition callback has applied, so
  autosave cannot persist an intermediate project state.
- A temporarily hidden stateful workspace, such as the workspace beneath
  Deliver, keeps stable layout dimensions. Do not use `display: none` for a
  mounted ReactFlow surface because zero-size observation can produce invalid
  viewport transforms and `NaN` SVG geometry.
- Rejected visual-transition lifecycle promises are consumed after the state
  callback is handled; a skipped animation must not become an unhandled error.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| View Transition API unavailable | Apply the state update synchronously and resolve |
| Native callback is deferred | Awaiting caller remains pending until the update runs |
| Visual transition is skipped or aborted after update | Preserve the applied state and consume lifecycle rejection |
| New project starts with a brief | Brief and pending Agent request survive the reset and appear in the mounted workspace |
| Existing project is restored | Store restoration and project-key change are observed atomically |
| Deliver opens over a mounted canvas | Workspace is inert and visually hidden while retaining finite geometry |

### 5. Good / Base / Bad Cases

- Good: create a project, await the transition application, then set the brief
  and request the Agent run; the durable user turn appears once.
- Base: a browser without View Transitions applies the same update immediately.
- Bad: call `withViewTransition(resetProject)` and immediately set the brief;
  the deferred reset later erases the user's submission.
- Bad: hide ReactFlow with `display: none`; its resize projection emits `NaN`
  SVG attributes when the workspace is restored or covered.

### 6. Tests Required

- Unit-test deferred and unavailable View Transition implementations, including
  skipped visual lifecycle promises.
- Headless E2E must submit a Home brief and wait for the visible durable user
  message before navigating away.
- Deliver E2E must return to the same DOM-backed workspace state and reject any
  React console warning containing `Received NaN for the`.
- New-project and restored-project tests must prove blank or old workspace state
  cannot overwrite the newly selected project.

### 7. Wrong vs Correct

```ts
// Wrong: the callback may run after the dependent brief write.
withViewTransition(() => resetProject())
getStoreState().setBrief(brief)

// Correct: reset and keyed mount apply together before bootstrap continues.
await withViewTransitionApplied(() => {
  resetProject()
  dispatchProjectShell({ type: 'create-project', project })
})
getStoreState().setBrief(brief)
```
