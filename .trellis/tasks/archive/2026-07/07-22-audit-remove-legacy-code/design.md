# Design: remove the legacy GUI Queue

## Boundaries

- Delete the obsolete external WebView/file-queue control plane. The supported
  external surface remains `cutout.control.v1` through CLI and MCP.
- Preserve current desktop Agent execution, provider configuration, local
  recovery, persisted project migrations, and all approval/policy boundaries.
- Delete Queue-exclusive semantic asset experimentation. Preserve current
  semantic naming fallback in `IntentWorkspace`; it is independent of the old
  generation experiment.
- Move the current diagnostic collector from `services/ai-native/diagnostics`
  to a neutral runtime diagnostics module instead of deleting it.

## Deletion Graph

1. Remove the package `ai` script, `scripts/cutout-ai.mjs`, its focused script
   test, `docs/AI_NATIVE.md`, README links, and the obsolete migration section
   from Agent integration documentation.
2. Remove `useAiNativeControl` from `AppShell`, the hook itself, and the
   `services/ai-native/actions` schema/tests.
3. Remove native `commands/ai_native.rs`, module/handler registration,
   application permission entries, and stale Playwright command stubs.
4. Remove `services/ai/semantic-slices`, its tests, the Asset Production
   semantic adapter/tests, adapter export, and experiment documentation.
5. Move diagnostics to `services/runtime-diagnostics`, update current consumers,
   and verify diagnostic bundle behavior remains unchanged.
6. Remove `@types/uuid`; `uuid` v14 supplies its own TypeScript declarations.

## Compatibility

- Breaking: historical `pnpm ai`, direct file-queue clients, and
  `window.__CUTOUT_AI__` automation stop working immediately.
- Preserved: `.cutout` control protocol, CLI/MCP, desktop Agent UI, configured
  providers, project restore, migration readers, updater/release contracts, and
  diagnostic bundle output.
- Existing `ai-native/` files in user application data are left untouched and
  ignored by the new app; uninstalling code must not delete user files.

## Contract Synchronization

- Update active Agent documentation and `agent-control-safety.md` to remove
  Queue-specific path/test requirements.
- `cutout.agent-capabilities.json` should remain semantically unchanged because
  it already advertises only `cutout.control.v1`; run `pnpm agent:validate` to
  prove no drift.
- Tauri permission and invoke-handler lists must remove every deleted command in
  the same change.

## Rollback

Rollback is a normal source revert. No persisted-data migration or deletion is
performed, so restoring the old Queue code restores compatibility with existing
on-disk queue files.
