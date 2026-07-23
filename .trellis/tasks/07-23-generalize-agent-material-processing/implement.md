# Implementation plan

1. Add the domain-neutral material-processing decision schema/tool and refactor
   composer locking so chat classification can complete before an image route
   is required.
2. Add frontend foreground-segmentation contracts, NativeBridge methods, local
   service adapter, registry wiring, and unit tests.
3. Implement target-specific macOS Vision commands plus truthful unsupported
   platform behavior, permission registration, invoke registration, and Rust
   tests.
4. Extend the internal paid-tool capability/executor with `semantic-cutout`:
   persist the original source, run semantic masking, retain the mask as an
   evidence artifact, run deterministic cutout, and publish final slices.
5. Extend Asset Production evidence with optional `maskArtifactId` and a caller-
   supplied provider route while preserving historical snapshot decoding.
6. Wire `IntentWorkspace` to execute the material decision without prototype
   planning, preserve cancellation/revision checks, and report capability gaps
   without generative fallback.
7. Add focused Agent routing and end-to-end workspace regressions for loaded
   source extraction, isolated sheet slicing, no-source behavior, unavailable
   segmentation, and no image-provider dependency for local operations.
8. Update active frontend specs and validate all TypeScript, lint, Vitest,
   production build, Agent contract, Tauri capability, Rust, i18n, and diff
   gates. Run the macOS semantic extraction smoke fixture where Vision is
   available.

## Risk And Rollback Points

- Do not transfer or close the store-owned source bitmap; encode or clone it.
- Do not silently use image editing/generation when foreground segmentation is
  unavailable or fails.
- Keep Apple dependencies under `cfg(target_os = "macos")` and target-specific
  Cargo dependencies.
- Reject unexpected CVPixelBuffer formats before reading memory.
- Publication remains atomic: mask/slice artifact writes may exist as orphaned
  content-addressed blobs after cancellation, but project state and production
  snapshots must not partially advance.
- Keep CLI/MCP/manifest unchanged because this milestone adds no external
  control operation.
