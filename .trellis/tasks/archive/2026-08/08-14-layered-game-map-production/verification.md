# Layered game map production verification

## 2026-08-16 - Gate 1

Implemented and verified contract/planning scope only:

- Registered strict `game-map.production-plan.v1`,
  `game-map.object-library.v1`, `game-map.runtime-manifest.v1`,
  `game-map.preview-receipt.v1` and `game-map.bundle.v1` schemas.
- Added canonical hashing for all five contracts.
- Compiled deterministic `tile`, `scene`, `side-scroll`, `grid`, `room-chunk`
  and `baked-scene` plans from natural language without a user mode selector.
- Enforced exact node role/kind/authority/dependency closure, grid/world and
  camera compatibility, planning-reference isolation and baked/playable
  rejection.
- Preserved `game-asset.layered-map.v1` as a separate readable legacy schema.
- Kept map schemas off the existing sprite atlas delivery compiler. Gate 1 does
  not claim a map compositor, real Provider map generation, semantic acceptance,
  managed export or production readiness.

Validation completed:

- Focused Map/Profile: 31 tests passed.
- Game Asset Profile: 72 tests passed, 6 real-environment tests skipped.
- Full repository: 2,598 tests passed, 21 skipped.
- Forced TypeScript build passed.
- Full oxlint passed.
- Production frontend build and bundle gate passed.
- Agent capability, product skill and Codex plugin validation passed.
- No frontend E2E was run.

## 2026-08-17 - Gate 2

Implemented deterministic local processing only:

- Added native bounded prop-pack and terrain-atlas extraction from exact retained
  PNG bytes with decoded dimensions, per-cell PNG/hash/byte evidence, Alpha
  bounds, edge contact, compact/wide/collision-bearing classification and
  seamable-versus-isolated terrain policy.
- Extended runtime manifests with exact terrain source/destination cells and an
  explicit navigation authority. Cardinal-4 reachability runs only from authored
  navigation data; other representations report `unavailable`.
- Added native runtime validation for canonical manifest/library hashes, exact
  accepted raster closure, decoded dimensions, layers, stale object revisions,
  placements, transforms, geometry, spawns, hazards, exits and reachability.
- Added deterministic Rust preview composition from accepted runtime visuals,
  atlas cells and object bytes, plus a distinct camera/geometry debug overlay.
  Planning/extraction sources and any blocking validation result are refused.
- Added strict frontend invoke/result schemas and byte re-hashing for extracted
  cells and composed preview/debug PNGs. Registered the four commands under a
  separate local `game-map-processing` Tauri permission with no path, network or
  secret authority.

Verification completed:

- Native processor tests: 4 passed, covering repeated byte identity, extraction
  classifications, isolated border rejection, unavailable navigation, stale
  revision refusal, and an explicitly unreachable exit.
- Focused Map/authoring/Tauri contract tests: 23 passed.
- Full repository: 2,609 passed, 21 skipped.
- Full Rust library: 319 passed, 18 ignored.
- TypeScript project build/type-check, full oxlint, Rust formatting, locked Cargo
  check and Agent/product/plugin validation passed.
- Vite production compilation completed. The repository-wide bundle-size gate
  remains blocked because the existing main entry is 544.8 KiB against its
  450.0 KiB limit; the new processor code is emitted in the separate
  `game-asset-profile` chunk, not that main entry.
- No frontend E2E was run.

These are deterministic decoded-PNG fixtures and contract checks. Gate 2 does
not claim real Qwen map generation, visual semantic quality, semantic acceptance,
managed export, accepted delivery, or production readiness. Those remain Gate 4.

## 2026-08-17 - Gate 3

Implemented the graph-backed workbench, isolated repair and managed candidate
delivery scope:

- Explicit natural-language map requests now enter the shared Game lane without
  a map-mode selector. The six-mode compiler remains the mode authority.
- Added one workbench projection for planning references, runtime layers, object
  library, terrain/placements, authored geometry, preview/debug evidence,
  dependency blockers and delivery state. Stale cross-revision inputs are
  rejected instead of being displayed as current.
- Added preview/replay repair for exactly one object, runtime visual, layer or
  authored manifest record. Unrelated record identity/order is immutable. Object
  repair stales only its library reference, dependent placements, preview and
  bundle; visual repair atomically rewrites exact dependent layer source ids.
- Added fixed-path managed bundle preview/apply. Every retained raster, canonical
  manifest and preview/debug file is re-hashed before save, and every returned
  save receipt must match path, SHA-256 and byte length.
- Gate 3 bundle inputs reject caller-authored semantic acceptance. Every bundle
  and successful export remains `candidate` / `candidate-exported` until Gate 4
  adds and exercises a native Map semantic verifier.

Verification completed:

- Focused Gate 3 map/routing/workbench coverage: 27 tests passed; the dedicated
  component routing/workbench test also passed independently.
- Full repository run: 2,616 passed, 21 skipped, and one unrelated
  `tauri-fetch` cancellation test timed out at five seconds under suite load.
  Its isolated rerun passed all 6 tests in 593 ms, so no stable failure was
  reproduced.
- Forced TypeScript project build, full oxlint and Agent/product/plugin contract
  validation passed.
- Production Vite build and bundle gate passed: the main entry is 388.3 KiB and
  the repository emits 81 chunks.
- No frontend E2E was run.

Gate 3 proves deterministic candidate assembly and managed export mechanics. It
does not prove real Qwen map quality, Map semantic acceptance, accepted delivery
or production readiness. Those claims remain blocked on retained real `scene`
and `tile` Gate 4 rehearsals.

## 2026-08-17 - Gate 4

Closed real production for one retained `scene` and one retained `tile` map:

- The fixed Keychain-backed `dashscope-qwen-image3` Provider executed
  `qwen-image-3.0-pro` for one runtime visual and one object visual per mode. The
  real generation rehearsal passed in 298.45 seconds and retained every source
  byte, native multimodal receipt, processed byte and runtime closure under
  `research/production-rehearsal-2026-08-17/`.
- The original v11 spatial-board cutout rejected the large landmark because its
  foreground occluded interior board samples. Current v12 keeps the closed
  high-chroma perimeter, safe threshold, PyMatting, boundary and anchor gates,
  but deterministically interpolates only occluded internal field nodes and
  records `interpolatedNodeCount`. Historical v9-v11 replay remains unchanged.
- Visual review accepted exact runtime-role fidelity, transparent object quality,
  composed preview and authored debug geometry for both modes, plus terrain-grid
  coherence for `tile`. Native acceptance then reverified every Provider receipt,
  source/result byte, processing implementation, runtime manifest and composed
  preview before signing `semantic-acceptance.json`; the zero-Provider acceptance
  test passed in 30.50 seconds.
- The renderer bundle compiler sent the exact acceptance closure back through the
  native verifier during preview and again during apply. It then sent the same
  fixed-path request through the production Rust atomic bundle writer, which
  re-read every file and returned path/length/SHA-256 receipts. No mock runner or
  mock repository established accepted status.
- The real accepted-bundle rehearsal passed both modes in 56.60 seconds. `scene`
  exported 8 files / 1,854,683 bytes with bundle hash
  `e1cdbb1ee285e63b916da72980b82d3a39e0d94101d515b44ce8d2d1b89eae71`;
  `tile` exported 8 files / 2,100,486 bytes with bundle hash
  `399e2ae267ea027607cc77ecdc9ee1d85c70c6b72e389532587a1692545fc003`.
  Both receipts report `deliveryStatus=accepted` and `status=accepted-exported`.
- The rehearsal exposed a real cross-realm byte bug in `BundleRepository`:
  realm-local `instanceof Uint8Array` misclassified valid renderer bytes as a
  Blob. The boundary now uses `ArrayBuffer.isView`, with a VM-realm regression.

Final validation completed:

- Full frontend: 2,630 passed, 23 skipped across 460 files.
- Full Rust: 323 passed, 22 ignored; locked Cargo check passed with the existing
  unused `keys.rs::entry` warning only; Rust formatting passed.
- Forced TypeScript build, full oxlint, production Vite compilation and frontend
  bundle gate passed (388.6 KiB main entry, 82 chunks).
- `pnpm agent:validate` passed all Agent capability, product Skill and Codex
  plugin checks.
- No frontend E2E was run. The Gate 4 proof directly exercised renderer APIs,
  native verification and native atomic save without browser automation.

Gate 4 proves production execution and accepted neutral delivery for the real
`scene` and `tile` paths. The other four map modes retain contract-level coverage
and must not inherit real-host visual-production claims from these two rehearsals.
