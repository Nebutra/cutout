# Design OS project change management - technical design

## Model

Layer immutable Project revisions and a typed command registry over the Kernel
OutcomeGraph. A ChangeSet owns proposed command history and evaluation but does
not become authoritative until merge emits one accepted Project revision.
Read/write sets and dependency closure drive rebase/conflict classification.

Approval records form a revision-bound lattice: Artifact, Outcome and Delivery.
Capability grants are evaluated separately from caller-authored payloads and
retain issuer, principal, scope, policy digest and expiry. ReviewThread,
ChangeRequest, ActionQueue and Agent Run records reference ChangeSet/Project
identities rather than copying state.

History is replayable semantic commands plus verified CAS snapshots. Milestones
are labels over revisions. Restore is ordinary command generation against the
current head, followed by preview, conflict checks and authorization.

`LibraryRelease` remains a product projection of approved
`cutout.global-library.v1` items and exact dependency closure. Project overrides
and declared Library precedence are explicit; insertion order has no meaning.

Project Bundle is a content-addressed transport, not a new source of truth. Its
manifest lists required protocols, Project head, object hashes, locked extension
closure and receipts; verified import compiles to an ordinary previewed
ChangeSet. Evidence usage/transmission/retention constraints participate in
authorization and delivery closure. Tombstones preserve historical references
when policy permits underlying unreferenced bytes to be collected.

## Compatibility And Rollback

First route new operations through the dispatcher, then wrap existing direct
workspace edits with adapters. Do not remove legacy paths until parity fixtures
pass. Multi-principal schemas are local records only and do not expose a remote
service. Existing Library references remain loadable through compatible schema
migration and old locked bytes remain in CAS.
