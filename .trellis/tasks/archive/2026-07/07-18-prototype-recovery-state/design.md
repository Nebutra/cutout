# Prototype Recovery State Design

## Architecture

Introduce a pure prototype-artifact projection module owned by `src/prototype/`.

```text
workspace.v1 persisted artifacts
          |
          v
recoverPrototypeArtifacts() ----> runtime artifacts with Blob URLs
          |                         + immutable diagnostics
          v
projectPrototypeArtifacts() <---- current generated/repaired artifacts
          |
          +--> canvas material/task status
          +--> outcome evidence
          +--> minimal repair plan
          +--> persistence (artifact fields only)
```

The projection has two independent axes:

- `artifact`: present only when persisted media invariants pass.
- `documentation`: `valid`, `repair-required`, or `missing-artifact`, always derived.

Repository normalization must not manufacture invalid media metadata. Raster material content
references carry optional intrinsic `pixelSize`; old references recover it from PNG/JPEG/WebP/
GIF/BMP headers before the workspace snapshot is projected.

No diagnostic is persisted. Replacing or editing an artifact automatically produces a new
projection on the next render, preventing state drift.

## Contracts

The shared module owns runtime artifact types currently local to
`IntentWorkspace.tsx` and exports:

- media validation for persisted bytes and dimensions;
- recovery for design-system and page artifacts;
- documentation diagnostics based on `designSystemMarkdownValidationError`;
- `hasValidDesignMarkdown` as the only evidence predicate.

Combined export validation remains available where a complete deliverable is required, but
restore and visual lifecycle code must never use it.

## UI Projection

- A design-system artifact is a ready canvas material even when documentation needs repair.
- `CanvasImageItem.healthDetail` communicates a non-blocking repair diagnostic without
  abusing task statuses (`queued`, `generating`, `failed`).
- If a plan/pages exist but no recoverable design-system visual exists, the placeholder is
  `failed / Needs repair` when no run is active; it is `generating` only during a real run.

## Outcome And Repair

`projectPrototypeOutcome` continues to receive booleans, but the caller supplies them from
the shared projection:

- visual present -> design-system evidence;
- documentation valid -> design-markdown evidence;
- documentation repair-required -> missing design-markdown requirement.

`planPrototypeRepair` therefore selects `synthesizeDesignMarkdown` while preserving the
visual and pages.

## Compatibility And Rollback

- Existing `workspace.v1` records require no migration.
- Legacy records with recoverable media become more permissive only at the visual recovery
  boundary; approval and delivery validation remain unchanged.
- The change can be rolled back by removing the projection module and restoring the local
  helpers, with no persisted-data rewrite.

## Trade-offs

- Recovery trusts positive persisted dimensions or repairs them synchronously from common
  raster headers. This avoids an asynchronous React loading race while retaining old IR and
  workspace compatibility.
- Pages remain visible if their design-system artifact is genuinely missing. Hiding valid page
  bytes would destroy evidence; the outcome instead remains incomplete and offers repair.
