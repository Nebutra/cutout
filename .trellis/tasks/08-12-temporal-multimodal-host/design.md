# Temporal media and multimodal host - technical design

## Architecture

Gate A ends at portable capability/receipt contracts plus verified Host-produced
media artifacts. It does not require Timeline UI or H3/Seedance adapters. Gate B
consumes those same contracts to make temporal composition authoritative product
state; it may progress after the benchmark path is already shippable.

`media-timeline.v1` is an ArtifactGraph projection whose immutable source clips,
takes and locks feed semantic Timeline commands. A compiler maps exact requested
operations to the capability matrix; a Host adapter owns Provider requests,
polling, download and secrets. Successful validated bytes and route receipts
return to the Kernel as result commands.

The Timeline stores editorial intent and non-destructive ranges rather than an
opaque final file. Provider generations are takes; assembly/delivery versions
reference exact accepted takes. Evaluation findings bind timecode plus artifact
hash so a repair can replace only its failing range.

## Provider Admission

Route descriptors separate input references, operation, duration, resolution,
audio, shot and control support. Evidence status is observed/verified rather
than inferred from Provider name. Official wire schema plus a sanitized live
probe is required before a route becomes executable. Native Host code retains
credential and origin boundaries.

## Compatibility And Rollback

`motion-ir.v1` is unchanged. Timeline support is additive and unavailable on
Hosts without exact adapters. Removing one Provider route changes capability
resolution only; stored timeline and other routes remain valid.
