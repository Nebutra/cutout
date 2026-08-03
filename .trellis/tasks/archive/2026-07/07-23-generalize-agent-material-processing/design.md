# Design: faithful source-material extraction

## Boundary

The first milestone introduces one domain-neutral operation: process the
currently loaded raster source without assuming it is a prototype page.

Two execution strategies are supported:

1. `split-isolated-assets` uses the existing deterministic white/transparent
   background worker.
2. `extract-foreground` uses a real semantic foreground-mask executor, then
   applies the deterministic worker to the transparent result to produce
   reviewable slices.

Semantic extraction never falls back to image generation or image editing.

## Agent Decision Contract

Add a pure tool-gate decision:

```ts
interface ProcessUploadedMaterialDecision {
  operation: 'extract-foreground' | 'split-isolated-assets'
  rationale: string
}
```

The tool is offered only when `source.bitmap` exists. It is selected when the
user asks to remove a background, isolate subject(s), cut out an existing image,
or split an already-separated asset sheet. The caller executes the decision;
the tool itself performs no mutation.

Composer routing becomes staged:

- lock and verify the chat route;
- run the decision tool gate;
- execute local material processing immediately when selected;
- lock the image route only when the request continues into prototype or image
  generation.

This prevents a missing image-generation provider from blocking local cutout.

## Service Contract

Add a `ForegroundSegmentationService` to the service registry:

```ts
interface ForegroundSegmentationCapabilities {
  available: boolean
  platform: string
  backend: 'apple-vision' | 'unavailable'
  reason: string | null
}

interface ForegroundSegmentationResult {
  png: Blob
  width: number
  height: number
  instanceCount: number
  backend: 'apple-vision'
}
```

The local service delegates through `NativeBridge`. Browser/unit tests inject a
fake bridge; no component imports Tauri directly.

## Native Contract

Add two bounded commands:

- `foreground_segmentation_capabilities()`
- `foreground_segment(bytes: Vec<u8>)`

`foreground_segment` rejects empty/oversized/invalid images. On macOS 14+ it:

1. creates a `VNImageRequestHandler` from the encoded source bytes;
2. performs `VNGenerateForegroundInstanceMaskRequest`;
3. selects all foreground instances;
4. requests a full-resolution, uncropped transparent pixel buffer;
5. converts BGRA rows into a PNG while preserving alpha.

The output records width, height, instance count, and backend. Unsupported
platforms and older macOS versions return `capability-required`.

Apple framework dependencies are target-specific so Linux and Windows builds
do not compile or link them.

## Tool And Production Flow

Add internal paid-tool capability `semantic-cutout` with a zero monetary
estimate and explicit approval, matching the existing local `cutout` policy.

```text
original source bytes
  -> content-addressed input artifact
  -> semantic-cutout receipt (local/apple-vision-foreground-v1)
  -> full-size transparent mask evidence artifact
  -> deterministic cutout worker
  -> transparent PNG slice artifacts
  -> Asset Production import-cutout tasks
  -> canvas/review projection
```

The mask evidence artifact is not projected as a user slice, but its id is
bound into production evidence. Final slices retain bounds, source artifact,
mask artifact, cutout parameters, backend route, and hashes.

## Compatibility

- Existing ordinary imports still auto-run deterministic cutout.
- Existing prototype planning, page generation, board cutout, repairs, and
  persisted schemas continue to decode.
- `semantic-cutout` is additive to the internal paid-tool receipt enum.
- Production evidence gains optional `maskArtifactId`; historical snapshots
  remain valid because the field is optional.
- External `cutout.control.v1`, CLI, MCP, and capability manifest are unchanged;
  the new executor is desktop-internal and must not be advertised there.

## Failure Matrix

| Condition | Required behavior |
| --- | --- |
| No loaded source | Do not offer the material-processing decision tool |
| User asks for isolated white-board slicing | Use deterministic cutout only |
| User asks for subject extraction on supported macOS | Run semantic-cutout after explicit approval |
| macOS older than 14, Windows, or Linux | Return capability-required; do not generate or enter prototype planning |
| Vision finds no foreground instances | Fail visibly and preserve prior source/results |
| Pixel buffer format is unsupported | Fail closed; do not publish corrupted PNG |
| Source/revision changes during execution | Drop the result before publication |
| Segmentation succeeds but deterministic slicing returns no subjects | Fail with no partial production commit |

## Validation

- Pure tool schema and staged composer-route tests.
- Service adapter tests with supported, unsupported, and erroring bridges.
- Desktop executor tests proving semantic-cutout stores mask evidence and
  publishes only final slices.
- Asset Production tests for `maskArtifactId` and provider route.
- Rust unit tests for capability truthfulness, limits, BGRA conversion, and
  unsupported-platform behavior.
- macOS integration smoke with a generated foreground/background fixture.
- Full TypeScript, lint, Vitest, build, Agent contract, Tauri permission, Rust,
  i18n, and cross-platform CI gates.

## Rollback

The feature is additive. Removing the decision tool, service registration,
internal capability, native commands, and optional evidence field restores the
previous behavior without migrating or deleting persisted user data.
