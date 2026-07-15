# Unified Delivery Center contract

- Protocol: `cutout.delivery-center.v1`.
- Receipt: `cutout.delivery-receipt.v1`.
- Targets: Brand Kit, Design System, visual assets, starter, registry, GitHub, Notion.
- Preview binds outcome and Design IR revisions, effects, destination and cost.
- One opaque approval is passed to existing target executors.
- Dependency failures skip downstream targets rather than reporting success.
- Required build, accessibility and visual gates require passed evidence.
- Composite success requires every selected target to succeed.
- Receipts bind kits, registry hashes, repository revision, files and external IDs.
- Credentials and secret-shaped metadata are rejected.
