# Layered game map production - technical design

## Contracts

- `game-map.production-plan.v1`: mode, coordinate system, canvas/camera, required
  visual/object/geometry nodes and delivery recipe.
- `game-map.object-library.v1`: accepted object artifacts, anchors, dimensions,
  occlusion class, placement-safe area and collision policy reference.
- `game-map.runtime-manifest.v1`: layers, placements, sort policy, collision,
  zones, spawn/exits, camera and exact accepted artifact revisions.
- `game-map.preview-receipt.v1`: compositor identity, input manifest/hash, input
  artifact identities, preview/debug hashes and validation findings.
- `game-map.bundle.v1`: accepted visual bytes, runtime manifest, previews, hashes
  and provenance.

Keep `game-asset.layered-map.v1` registered for compatibility. New production
uses the new contracts rather than adding optional fields to the old schema.
This task reuses the parent atomic image/cutout authority and produces neutral map
bundles consumed by engine adapters and the coverage ledger.

## Mode Recipes

- `tile`: tileset/terrain atlas, tile layers, object layers, collision, zones,
  exits and preview.
- `scene`: ground/base plate, dressed planning reference, transparent objects,
  placements, collision/zones and preview.
- `side-scroll`: same-sized parallax plates/segments, platform/object geometry,
  hazards/checkpoints/exits, camera bounds and preview.
- `grid`: grid/cell dimensions, terrain semantics, movement/buildability/resource
  data, objects, geometry and preview.
- `room-chunk`: reusable chunks, sockets/exits, collision/spawns, seam validation
  and assembled preview.
- `baked-scene`: fixed accepted visual with explicitly limited runtime semantics.

## Authority Flow

```text
intent -> mode plan
  -> real visual generations + retained receipts
  -> accepted base/tiles/objects
  -> reviewed authored runtime manifest
  -> deterministic compositor + geometry validator
  -> semantic acceptance
  -> neutral map bundle
```

The dressed reference is never an input to the final compositor except as
attributed review evidence. The compositor consumes only runtime-authoritative
visuals and manifest data. Geometry validation is deterministic; visual coherence
and object placement quality remain attributed semantic review.

## Repair

ArtifactGraph dependencies are granular: placements reference object revisions;
preview references placements plus visuals; bundle references the accepted
preview closure. Replacing one prop stales its placements/preview/bundle, not the
base or unrelated object library entries.

## Deterministic Processor Boundary

- The native processors accept retained base64 PNG bytes and strict content/
  acceptance references, never caller-selected paths or Provider credentials.
- PNG signature/header and per-raster/aggregate byte and pixel budgets are
  checked before full decode so compressed inputs cannot bypass memory bounds.
- Prop cells are blocked when empty or edge-touching; classification is exact:
  authored collision first, then Alpha width at least 1.5 times Alpha height as
  `wide`, otherwise `compact`.
- Terrain grids must exactly equal decoded atlas dimensions. `isolated` rejects
  cell-edge Alpha while `seamable` records and admits deliberate edge fill.
- Runtime validation recomputes canonical portable JSON hashes, accepted raster
  SHA-256 identities, decoded dimensions, object/layer revisions, placements,
  geometry, spawn/exit validity and explicit cardinal-4 reachability.
- Native compositor v1 supports exact-size full plates, exact atlas cell copies,
  and unit-scale/unrotated object placement. A transform it cannot reproduce
  byte-deterministically is a blocker rather than an approximation.
- Preview and debug overlay are separately PNG-encoded by Rust `image 0.23`.
  The debug overlay always includes camera geometry and may never share preview
  bytes. Frontend callers re-hash every returned PNG before accepting the result.

## Rollback

Mode recipes and new manifests are additive. Disabling production leaves retained
maps inspectable; a compositor/export failure cannot change accepted source art.
