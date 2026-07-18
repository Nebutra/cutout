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
