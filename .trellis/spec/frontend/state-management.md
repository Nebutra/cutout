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
| Unselected multi-direction set reloads | restore `design-system-selection`, not `idle` |
| Two compilers fingerprint raw vs normalized IR | reject as drift; update both to fingerprint the validated normalized document |

### 5. Good / Base / Bad Cases

- Good: two candidates persist, one is selected, tokens and exports bind to its
  Markdown, and both directions remain inspectable after reload.
- Base: an old project with one system restores exactly as before through a
  one-candidate selected wrapper.
- Bad: the UI stores candidate bytes but Design IR still contains only a
  mutable alias with no grouping, provenance, or selected token lineage.

### 6. Tests Required

- Candidate runtime unit tests for status updates and human/Agent selection.
- Workspace fingerprint and repository round-trip coverage for candidate state.
- Legacy projection coverage for candidate materials, selection provenance,
  selected tokens, and workspace reconstruction.
- Compiler coverage proving exact selected `DESIGN.md` emission and SHA/revision
  rejection.

### 7. Wrong vs Correct

```ts
// Wrong: every generated direction becomes downstream authority.
tokens = candidates.flatMap(projectTokens)

// Correct: selection controls the singular projection and token lineage.
const artifact = artifacts[candidateSet.selection.candidateId]
tokens = projectDesignMarkdownTokens(parseEditableDesignMarkdown(artifact.designMarkdown), {
  provenanceId: candidateSet.selection.provenanceId,
})
```
