# General Design OS desktop workbench - technical design

## Projection Model

Decompose `IntentWorkspace` into a domain-neutral controller plus registries for
artifact renderers, inspectors and semantic actions. The controller consumes
Kernel/Project projections only; no renderer owns state. Brief/Sources/Board/
Review/Deliver remain stable while selected Outcomes and artifact types determine
contextual panels.

Designer and Builder are contextual lenses, not global personas. Both resolve
the same commands and records; Designer emphasizes composition, visual compare,
annotations and readiness, while Builder exposes semantic diff, checks, target
bindings and receipts. Advanced controls expand progressively without duplicating
state or hiding required gates.

Timeline and Board share selection, locks, ChangeSet and Agent context. Stable
responsive dimensions prevent dynamic artifacts or localized labels from
shifting controls. Media previews are real artifact bytes with explicit loading,
unavailable, invalid and stale states.

Projection selectors consume indexed affected revisions. Board, Timeline,
history and queue collections virtualize beyond the visible window, and preview
media is decoded lazily from CAS. Reference-hardware baselines track load,
selection, command preview and scroll memory without making UI state authoritative.

## Migration And Rollback

Introduce the controller and registries behind the existing prototype adapter,
then move one surface at a time. Keep the current workspace selectable until
prototype parity and mixed-Outcome visual journeys pass. Desktop capability UI
is derived from truthful Host resolution, not Profile wishes.
