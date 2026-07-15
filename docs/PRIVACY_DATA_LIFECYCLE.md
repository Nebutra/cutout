# Privacy Data Inventory And Lifecycle

Telemetry and crash reporting are opt-in and disabled by default. Provider credentials are not
Cutout data: the desktop/provider host owns them and exposes only opaque revocable handles.

| Data class | Storage | Default retention | Export | Delete |
| --- | --- | --- | --- | --- |
| Design IR, project sources and provenance | Local project `.cutout` state | Until project deletion | Project export | Delete project/workspace |
| Global Library metadata and blobs | Local IndexedDB | Until user deletion | Library export with hashes | Library item/blob deletion |
| OAuth/plugin/MCP sessions | Host secret store; opaque handle in memory | Session expiry/revoke | Session metadata only | Disconnect/revoke |
| Delivery and approval receipts | Local project state | Project lifetime | Receipt JSON | Project deletion |
| Local review branches/comments | Local IndexedDB | Until workspace deletion | Team-state export | Delete branch/workspace |
| Telemetry events | No sink by default | `0` days by default; maximum policy is 90 | Provider-specific after opt-in | Provider-specific after opt-in |
| Crash reports | Disabled by default | None | Not applicable while disabled | Not applicable while disabled |
| Remote cloud data | No production backend | None | Deployment blocked until verified | Deployment blocked until verified |

## Local recovery and diagnostics

- Project `.cutout` state is authoritative. IndexedDB catalogs and UI indexes are local projections that may be verified, repaired, garbage-collected, or rebuilt from an authorized snapshot.
- Desktop recovery accepts only an opaque workspace handle previously authorized by the Registry host. The UI cannot supply, scan, display, or replace a filesystem path. The controlled host fixes recovery to `<authorized-root>/.cutout/agent-host-state.json`.
- Automatic checkpoints are content-hashed and retention-bound. Restore rejects corrupt snapshots and collisions; migrations publish only after verification and quota preflight.
- Startup crash markers remain local. Repeated unclean startup can recommend safe mode; resetting UI state removes only explicit preference keys and never deletes projects or Library content.
- Diagnostic bundles are previewed locally before export. By default they exclude prompt/content/message/path fields and credential-shaped values, and contain bounded host status/count evidence rather than run payloads. There is no remote diagnostic or telemetry sink.
- Host events are supportability projections only. Durable runs, receipts, and checkpoints remain the execution truth.

Telemetry schemas forbid content, prompts, credentials and file-path property classes. Enabling
telemetry must be an explicit user action and must show retention and destination. Disabling it
stops future emission. A remote backend cannot be production-ready until health, encryption,
audit logging, backup restore, data export and deletion are verified with evidence.
