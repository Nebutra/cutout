# Remove Legacy Compatibility Surfaces - Design

## Boundary

The release is an intentional schema break. Every persisted or protocol input
is parsed against its current schema. A retired shape is rejected or replaced
with the normal empty current state; it is never migrated.

```text
current WorkspaceSnapshot <-> current DesignDocument
current CapabilityBindings -> derived primary chat/image view
current WorkspaceNavigation -> current surface projection
```

## Design IR Projection

Move the active conversion code from `legacy-projection.ts` to a current
workspace projection module. Rename legacy-named identities/artifacts and
supplemental content helpers. Accept `WorkspaceSnapshot` only. Content stored
outside Design IR uses a current `cutout://workspace/` URI namespace.

Project repository load accepts only validated current Workspace and Design IR
records. It does not backfill missing runtime fields from old slice arrays or
construct Design IR from malformed historical records.

## Asset Production

Remove migration-only route/status enum values and the legacy slice migration
module. A missing current asset-production snapshot becomes the empty current
snapshot; current planners/runtime are responsible for creating work.

## Model Routing

`ai.capabilityBindings` is the only persisted key. Remove the schema's legacy
slot payload and all reads of `ai.modelAssignments` / browser v1 routes. Keep a
small derived primary-assignment projection only while current consumers still
need the two-slot view; name it as a current projection, not a migration.

## Navigation And External Surfaces

Persist and parse only WorkspaceNavigation v2. Replace legacy view migration
helpers used by current UI commands with explicit current action projections.
Remove former Pencil surface kinds from protocol schemas and tests.

## Credentials

Delete the retired plaintext secret-store module and startup migration call.
Provider credentials continue to use the OS keyring and native provider
boundary.

## Tool Approval Events

`tool-approval-requested` records only the request identity, selected route,
budget ceiling, approval policy, reason, and whether human approval is pending.
It does not copy the host capability's `estimatedCost` into the durable event,
run projection, timeline, or view model. Internal planning may compare a host
capability estimate with the request ceiling before execution; completed tool
receipts remain the only durable record of actual charged amounts.

## Rollback

Rollback is source-level only: revert this task's commit. There is deliberately
no runtime migration or compatibility rollback path in the shipped build.
