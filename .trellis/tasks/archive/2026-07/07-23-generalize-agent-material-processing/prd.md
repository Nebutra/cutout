# Generalize Agent material processing

## Goal

Evolve Cutout's Agent from a prototype-specific pipeline controller into a
goal-directed material production orchestrator. The Agent must reason from the
user's source material, requested outcome, quality constraints, and available
capabilities rather than assuming every request starts with an app brief and
must pass through prototype planning.

The target experience includes at least:

- slicing reusable assets from an already-drawn prototype or composition;
- extracting one or more subjects from an ordinary image;
- generating and iterating game, illustration, marketing, or UI materials;
- accepting work at an arbitrary stage and performing only the missing steps.

## Confirmed Facts

- Any supported imported image currently enters `loadImage` and auto-runs the
  deterministic cutout worker.
- The deterministic worker is not general semantic segmentation. It flood-fills
  near-white/transparent background connected to the image border, applies
  alpha/matting, then finds and splits connected foreground boxes.
- The generated prototype path deliberately converts page regions into
  pure-white, spatially separated asset boards before applying that worker.
- Current Agent orchestration falls through to `planPrototypeSuite` and exposes
  prototype-oriented decisions such as prototype regeneration and page
  targeting.
- Current material identity is limited to design systems, prototype pages, and
  cutout slices; impact planning is expressed as project/design/page/slice.
- Asset Production already provides useful generic primitives and provenance:
  `board-cutout`, `direct-generate`, `import-cutout`, immutable source/output
  artifacts, QA evidence, review states, and lineage.
- No general foreground-segmentation or subject-mask engine is implemented.
  Ordinary photos only work reliably when the background already satisfies the
  existing edge-connected white/transparent assumption.
- Persisted `.cutout` Design IR and provenance remain authoritative. The Agent
  must not claim a capability that its selected executor does not implement.

## Requirements

- Separate intent understanding from workflow execution. The Agent first
  determines the requested outcome and whether the input is a source,
  reference, intermediate material, or existing deliverable.
- Represent material domain independently from operation. UI screen, game
  sprite, character, object, texture, background, icon, photo subject, and
  arbitrary raster composition must not require a prototype-page identity.
- Support stage entry at any point: inspect/classify, segment/cut out, slice,
  generate, edit, repair, upscale/vectorize where supported, review, and export.
- Plan the smallest capability graph that transforms the available inputs into
  the requested outputs. Do not generate a prototype plan when the user only
  asked to cut out or slice an existing image.
- Route by evidence and capability requirements, not by keywords alone. A route
  must declare input assumptions, output contract, cost, quality checks, and
  fallback behavior.
- Preserve exact uploaded bytes and provenance. Model-assisted redraw must be a
  distinct, user-visible transformation and never silently replace extraction.
- Fail honestly when reliable segmentation is unavailable. Offer a bounded
  alternative such as user mask guidance, an installed segmentation provider,
  or model-assisted reconstruction, with the quality trade-off made explicit.
- Keep review and publication contracts domain-neutral: every produced material
  binds source revision, operation, mask/bounds where applicable, executor,
  artifact hash, QA evidence, and lineage.
- Game-material workflows must be first-class consumers of the same primitives,
  including sprite sheets, isolated characters/props, tileable textures,
  backgrounds, VFX layers, and variants, without introducing a separate Agent.

## First Milestone Scope

- Prioritize faithful processing of a user-supplied source image before broader
  game-material generation.
- Add a real local foreground segmentation executor on macOS 14+ using Apple
  Vision. It must preserve source pixels and alpha-mask the background rather
  than redraw the subject.
- Route explicit Agent requests to either semantic foreground extraction or the
  existing isolated white/transparent-board slicer without entering prototype
  planning.
- Reuse the existing content-addressed desktop tool, approval, receipt, cutout,
  Asset Production, review, and slice projection boundaries.
- Report a truthful capability gap for semantic extraction on unsupported macOS
  versions, Windows, and Linux. The existing deterministic cutout remains
  available on every supported platform.
- The first milestone handles the current workspace source image. Attachment-
  only processing, interactive point/brush masks, and game generation remain
  follow-up work.

## Acceptance Criteria

- [ ] The architecture can express uploaded prototype slicing without creating
  or regenerating a prototype suite.
- [ ] The architecture distinguishes deterministic white-background cutout,
  semantic subject segmentation, model-assisted reconstruction, and generation.
- [ ] An ordinary-photo request either produces a validated subject mask/output
  through a real segmentation capability or returns an honest capability gap.
- [ ] The same planner can express UI, game, marketing, illustration, and generic
  image-material jobs using shared operation and artifact contracts.
- [ ] Partial workflows preserve completed inputs and execute only missing or
  explicitly requested stages.
- [ ] Uploaded originals, masks, slices, generated variants, QA evidence, and
  lineage remain inspectable and revision-bound.
- [ ] Existing prototype production and persisted project compatibility remain
  supported during migration.
- [ ] User-facing routing never claims live segmentation, generation, editing,
  or export behavior that the selected provider/executor cannot perform.
- [ ] On macOS 14+, an Agent request to remove the background from the loaded
  source uses Apple Vision, preserves original subject pixels, and publishes
  one or more transparent PNG slices with receipts and production lineage.
- [ ] On unsupported hosts, the same request returns `capability-required`
  without falling through to prototype generation or generative reconstruction.

## Notes

- This is a complex cross-layer task. A technical design and implementation plan
  are required after the product priority is resolved.
