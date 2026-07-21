# Technical design

## Boundary

The product surface becomes parameter-free while the deterministic cutout
pipeline keeps receiving `CutoutParams`. `DEFAULT_PARAMS` is the sole runtime
configuration owned by the application.

## Data flow

```text
source load -> useAutoRun -> analysis bridge -> worker(DEFAULT_PARAMS) -> slices
legacy project params -> restore decoder -> ignored -> DEFAULT_PARAMS
```

## Changes

- Delete the source parameter components and remove their render site.
- Remove the Advanced settings reset row and empty-state tuning buttons.
- Reduce the params Zustand slice to immutable `params: DEFAULT_PARAMS` state.
- Keep `ProjectRestoreInput.params` optional for source compatibility, but make
  `restoreProject` assign `DEFAULT_PARAMS` instead of persisted values.
- Remove parameter actions from the AI-native Zod union and command switch.
- Remove `params` from AI-native snapshots because it is no longer an Agent
  control or meaningful product state.
- Simplify `useAutoRun` to source-identity behavior and delete the unused
  parameter-only hook and slider-range constants.
- Regenerate Lingui catalogs after source message removal.

## Compatibility

Old local records may still carry all four numeric fields. Decoders continue to
accept them, so opening the record does not fail. Runtime restore intentionally
discards them and applies current defaults. Saving may retain the schema field
for now; it represents internal runtime configuration, not a supported user
preference.

## Trade-offs

The deterministic defaults are not adaptive. This change removes misleading
manual responsibility without claiming that image-specific intelligence has
already been implemented. Automatic parameter estimation can later replace the
single default provider behind the same worker contract.

## Rollback

The change is source-only and can be reverted without migrating stored data.
No persisted schema field is deleted.
