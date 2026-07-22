# Legacy inventory

## Classification rules

| Classification | Disposition |
| --- | --- |
| Dead/unreachable implementation | Delete with imports, tests, docs, and dependencies |
| Explicitly deprecated public surface | Delete only after compatibility-horizon approval |
| Persisted-data migration/reader | Retain until its supported data horizon is retired |
| Generated output | Regenerate from its authoritative source; do not edit independently |
| Current fallback/error behavior | Retain unless replaced by an equivalent supported contract |
| Uncertain consumer or ownership | Research before disposition |

## Confirmed candidates

| Candidate | Evidence | Size / consumers | Final disposition |
| --- | --- | --- | --- |
| Legacy GUI queue: `pnpm ai`, `window.__CUTOUT_AI__`, `ai_native_*` | `docs/AI_NATIVE.md:3` and `docs/AGENT_INTEGRATION.md:153` marked it deprecated/compatibility-only; current replacement is `cutout.control.v1` | At least 2,344 direct lines plus AppShell, Tauri permission/lib registration, visual stubs, README links, and experiment docs | Removed as one unit, including scripts, bridge, actions, native handlers, permissions, tests, docs, and stubs |
| `semantic-slices.v0` experiment and semantic production adapter | Only production caller was `useAiNativeControl`; remaining consumers were their own tests/docs | Service, tests, adapter, export, and experiment doc | Removed with Queue; `semantic-repair` remains decode-only in persisted schemas and is rejected by new planners |
| AI Native diagnostics module name | Collector is used by startup recovery, Agent execution, and diagnostic bundle export independently of Queue | Three current UI consumers | Behavior retained as `src/services/runtime-diagnostics.ts`; all three consumers migrated without changing bundle fields |
| `@types/uuid` | Package itself is a deprecated stub; `uuid` v14 provides its own types | Direct dev dependency only | Removed from `package.json` and lockfile |

## Confirmed required compatibility

| Path / contract | Current owner evidence | Disposition |
| --- | --- | --- |
| `src/asset-production/migration.ts`, `legacy-ready`, `legacy-imported` | Project repository calls the idempotent migration on restore; pipeline spec requires honest legacy export | Retain |
| `src/workspace/navigation.ts` legacy Design OS mapping | Loads legacy persisted navigation and maps current UI back to existing workbench surfaces | Retain |
| `src/global-library/store.ts` catalog migration/downgrade preview | Store loads unknown v0 shape; offline compatibility corpus asserts upgrade/downgrade behavior | Retain |
| Model assignment legacy migration/projection | Local settings loader migrates old chat/image and route records into v2 bindings | Retain |
| Provider configs without `wireProtocol` | Archived protocol-family decision requires conservative defaulting for existing records | Retain |

## Further research after scope decision

- Unused exports and modules outside the GUI queue.
- Dependencies with no production or tooling consumer.
- Old aliases and compatibility projections whose persisted consumers have
  already been rewritten and released.
- Documentation and experimental fixtures that describe removed entry points.

## Final verification

- Shipping source, permissions, scripts, tests, README files, docs, and active
  specs contain no retired Queue or semantic-slices identifiers.
- TypeScript, lint, Vitest, production build/bundle, Rust, Agent contract, i18n,
  release-contract, Playwright, and diff checks pass.
- Persisted project/provider migrations, local semantic naming, updater policy,
  and diagnostic bundle behavior remain supported.
