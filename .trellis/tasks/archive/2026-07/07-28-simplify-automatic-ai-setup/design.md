# Design

## Boundary

This is a frontend projection change. Native provider discovery, credential
drafts, the 39-Agent registry, Tauri permissions, and the Agent capability
manifest remain unchanged.

## State Projection

One pure projection owns the visible setup state:

```text
providers + provider verification receipts + capability bindings
  + provider-discovery query state
    -> checking | ready | needs-verification | needs-capabilities
       | discovered-credentials | needs-provider | unavailable
```

Only enabled, verified Providers contribute to readiness coverage. Discovery
candidates are filtered to importable actions and are presented only while no
verified Provider can make the setup ready. Full Agent inventory rows never
enter this projection.

## UI Composition

- `AiSection` owns discovery once and renders a single setup overview.
- The overview contains the outcome, minimal supporting evidence, and the
  primary action.
- Importable candidates are action rows inside the outcome, not a separate
  inventory section.
- A single controlled advanced disclosure owns Provider rows, add/edit/remove,
  manual model bindings, and Vectorizer configuration.
- `LocalAgentInventoryPanel` is removed as dead UI; the native/service inventory
  remains available for future authorized consumers.

## Verification Truth

The existing persisted provider-verification receipt is authoritative for the
ready claim. A small subscription around the receipt store keeps the overview
and Provider rows coherent after verify/import/edit operations in the same
window. No secret or native failure detail enters that store.

## Compatibility And Rollback

No persisted schema or IPC payload changes. Rollback restores the prior UI
composition without migrating data. Update the BYOK Settings spec because its
current requirement to render all 39 rows conflicts with the new product
decision.
