# General Design OS desktop workbench - implementation plan

## 1. Shared product taxonomy and navigation

- [x] Add the six lifecycle sections and five Profile descriptors.
- [x] Add one exhaustive compatibility map for every existing Workbench tab.
- [x] Add unit tests proving Profiles are contextual destinations rather than
      global Project modes.

## 2. Unified Workbench shell

- [x] Replace global domain tabs with Brief, Sources, Create, Review, Deliver and
      Inspect navigation on both dialog and inline surfaces.
- [x] Preserve existing callbacks, lazy loading, Project revision and back
      navigation.
- [x] Keep one destination state and stable responsive dimensions.

## 3. Product UI/UX and profile lanes

- [x] Make Product UI/UX the default Create lane and project existing Specimen
      and Figma views beneath it.
- [x] Mount current Commerce and Game Asset panels as Create lanes without
      editing their domain implementations.
- [x] Project Brand from current kit readiness and keep Motion explicitly
      unavailable.

## 4. Review and delivery closure

- [x] Add a Review projection derived only from governance, readiness, blockers,
      stale state and existing receipts.
- [x] Reuse Delivery Center, Kits, Components and Starter under Deliver with
      preview/apply separation unchanged.
- [x] Move evaluator-only or diagnostic surfaces under Inspect.

## 5. App integration and migration

- [x] Update AppShell dialog title/copy and legacy launch routing.
- [x] Preserve intent-first Game Asset launch input and normal Commerce Project
      production.
- [x] Add component and integration tests for lifecycle/profile routing.

## 6. Visual and quality validation

- [x] Run isolated headless Playwright desktop/mobile geometry and screenshot
      checks without controlling the user's GUI.
- [x] Run Workbench, workspace navigation, Commerce and Game regression tests.
- [x] Run lint, strict TypeScript, production build, bundle gate and
      `git diff --check`.
- [x] Update the Workbench code-spec with the executable navigation and authority
      contract.

## 7. UI/UX convergence

- [x] Remove the duplicate outer Deliver drawer and route the rail directly to
      the shared Workbench Deliver section.
- [x] Rename the narrow workspace entry to Design and its expanded action to
      Open workbench; keep it distinct from the six-stage lifecycle.
- [x] Default Product UI/UX Create to Canvas while preserving exact legacy
      Specimen and Figma destinations.
- [x] Project the real Project brief instead of a count-only placeholder.
- [x] Persist Commerce production across Create, Review, and Deliver with an
      explicit exact-hash acceptance gate and stale-revision blocking.
- [x] Keep visited Create Profiles mounted so navigation cannot discard domain
      state; retain Benchmark downloads under Inspect/Labs.
- [x] Describe Commerce Run inputs truthfully as bounded local production input;
      do not pretend general Sources retain the required file bytes.
- [x] Rename Commerce delivery to Download files because the browser emits one
      manifest and each retained artifact, not one archive.
- [x] Runtime-validate persisted Commerce lifecycle records and add focused
lifecycle, download, WorkspaceSnapshot, repository, and rendered gate tests.
- [x] Preserve the exact active workspace drawer behind the inline Workbench so
Back returns to the same Agent/Files/Git/Design context without restoring a
duplicate Deliver drawer.
- [x] Lazy-load the Commerce lifecycle decoder at project recovery so strict
persistence validation does not pull the Commerce production DAG into the main
frontend entry.

## 8. Remaining redundancy convergence

- [x] Route Product UI/UX Canvas directly to the existing Project canvas and
remove the Workbench trampoline.
- [x] Reduce the Design drawer to one contextual `DESIGN.md` surface and one
canonical Product UI/UX route.
- [x] Render retained Commerce artifacts plus Provider, QA and playback receipts
inline in Review before exact-hash acceptance.
- [x] Keep Product System/Figma generation and inspection in Create, imports in
Sources, diff approval in Review, and downloads/publication in Deliver.
- [x] Remove the legacy Specimen-only dialog sizing branch and reuse one stable
Workbench geometry.

## First Migration Slice

This turn owns sections 1-5 plus focused validation. Timeline, Matrix,
virtualization and additional domain adapters remain follow-up slices because
their executable artifact contracts are independently owned.

## Risky Files And Rollback Points

- `src/components/design-os-workbench/DesignOsWorkbench.tsx`: preserve every
  existing callback and lazy domain mount while changing only the shell.
- `src/components/AppShell.tsx`: do not broaden the existing special launch
  authority or alter Provider execution.
- `src/components/design-os-workbench/GameAssetProductionPanel.tsx`: parallel
  ownership; do not edit.
- `src/components/design-os-workbench/CommerceProductionPanel.tsx`: retain its
  Project/Benchmark authority isolation; do not refactor its internals here.
