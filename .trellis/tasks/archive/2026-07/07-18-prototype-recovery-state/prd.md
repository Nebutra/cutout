# 根治原型恢复状态不一致

## Goal

Make persisted prototype recovery truthful and deterministic: a recoverable design-system
visual must never disappear merely because its `DESIGN.md` is incomplete, and every
consumer must derive status from the same normalized artifact projection.

## Background

- Generation creates a design-system visual before generating prototype pages and passes
  that visual into page generation (`src/components/workspace/IntentWorkspace.tsx:2006`).
- Restart recovery currently rejects the entire persisted design-system artifact whenever
  `designSystemValidationError` reports a Markdown/frontmatter/token problem
  (`src/components/workspace/IntentWorkspace.tsx:6141`).
- Page artifacts are restored independently and unconditionally
  (`src/components/workspace/IntentWorkspace.tsx:6151`). This produces the observed false
  state: design system `Queued`, prototype page `Ready`.
- Outcome projection currently treats any non-empty Markdown string as portable
  `DESIGN.md` evidence (`src/components/workspace/IntentWorkspace.tsx:731`), even when the
  same document fails the export contract.
- Design IR reverse projection manufactures `width: 0` and `height: 0` for a resolved
  design-system image (`src/design-ir/legacy-projection.ts:353` before this fix). Repository
  normalization can therefore corrupt valid persisted metadata before React recovery runs.

## Requirements

### R1. Separate artifact integrity from documentation health

- A persisted visual artifact is recoverable when its bytes and dimensions satisfy the
  persisted-media boundary.
- Missing/invalid YAML frontmatter, missing exportable tokens, or missing color tokens must
  produce a derived `repair-required` documentation diagnostic without deleting the visual.
- Empty bytes may reject the affected visual artifact. Invalid legacy dimensions must first
  be repaired from trustworthy raster headers; only unrecoverable metadata may be rejected.

### R2. One normalized projection

- Recovery and current-state projection must use one pure, testable prototype-artifact
  module shared by initialization, outcome projection, canvas status, and repair planning.
- Documentation health must be derived from the current artifact. It must not be stored as
  an independently mutable React or workspace field.
- Existing `workspace.v1` snapshots must remain readable without migration or invented data.
- New Design IR content references must carry intrinsic raster dimensions, while older IR
  documents without them recover dimensions from image bytes.

### R3. Truthful status and repair behavior

- A recovered design-system visual with invalid documentation remains visible and is not
  rendered as `Queued`.
- The canvas may label that ready visual as needing `DESIGN.md` repair.
- Outcome evidence counts `design-markdown` only when the shared documentation validation
  contract passes.
- Repair reuses the recovered visual and synthesizes only `DESIGN.md`; it must not regenerate
  the visual or already-ready pages.
- When pages exist but the design-system visual is genuinely absent/corrupt, the canvas must
  say `Needs repair`, not `Queued`.
- The continuation action must remain available while the missing design-system card is
  selected and must execute the minimal repair plan instead of regenerating ready pages.

### R4. Preserve generation and persistence invariants

- Generation-time documentation problems must not erase an otherwise decoded visual.
- Persistence must round-trip recoverable visual bytes, dimensions, media type, name, and
  documentation unchanged.
- No changes may weaken Cutout's approval, provenance, or Agent capability contracts.

## Acceptance Criteria

- [x] A snapshot with valid design-system media and invalid/missing frontmatter restores the
      design-system visual and pages, with documentation health `repair-required`.
- [x] A snapshot with zeroed dimensions and a valid raster header repairs its dimensions;
      empty/unrecoverable bytes reject only that visual while valid pages remain recoverable.
- [x] Valid documentation yields `hasValidDesignMarkdown === true`; non-empty but invalid
      documentation yields `false` and leaves the visual present.
- [x] The canvas never projects a recovered visual as a queued task, and a genuinely missing
      design system alongside ready pages is labeled `Needs repair`.
- [x] Outcome and repair tests prove invalid documentation schedules Markdown synthesis only.
- [x] Design IR round-trip tests preserve intrinsic dimensions and repair old IR that omits
      pixel metadata.
- [x] Focused tests, lint/type-check/build, `pnpm agent:validate`, and the macOS app build pass.
- [x] The rebuilt app replaces the old `/Applications/Cutout.app` and launches successfully.

## Out Of Scope

- Changing the persisted `workspace.v1` schema.
- Regenerating existing user artifacts solely to make their documentation valid.
- Adding cloud synchronization, live collaboration, or new provider capabilities.
