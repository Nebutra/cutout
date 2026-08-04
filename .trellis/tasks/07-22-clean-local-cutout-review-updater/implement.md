# Implementation Plan

1. Inventory bundle paths, versions, signatures, running processes, CPU
   architecture, and Release asset metadata.
2. Download and verify the `v0.1.3` Apple Silicon DMG in a temporary directory.
3. Validate the mounted app, stop Cutout, unregister stale bundles, and move
   them to unique Trash paths.
4. Install and register `/Applications/Cutout.app`, launch it, and verify the
   final path/version/signing/notarization state.
5. Inspect updater runtime, orchestrator, release workflow, metadata generation,
   version synchronization tests, and remote/tag flow.
6. Run focused updater/release tests and report findings without changing code.

## Validation Commands

```bash
shasum -a 256 -c <filtered-checksum-file>
codesign --verify --deep --strict --verbose=2 /Applications/Cutout.app
spctl -a -vv /Applications/Cutout.app
xcrun stapler validate /Applications/Cutout.app
pnpm exec vitest run src/updater scripts/release-workflow.test.ts scripts/update-artifacts.test.ts scripts/validate-release-version.test.ts
pnpm agent:validate
```
