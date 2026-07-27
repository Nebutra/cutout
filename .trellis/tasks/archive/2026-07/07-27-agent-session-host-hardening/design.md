# Technical design

## State and locking

Resolve every workspace handle through `RegistryDesktopState::authorized` and
derive the lock key from the canonical root, not the handle. Keep persisted Host
state workspace-local and version the file format only if new serialized fields
are required.

Introduce a process registry in `AgentHostDesktopState` keyed by a stable
canonical workspace digest plus run/node IDs. Process handles and cancellation
channels remain memory-only; persisted PID/process-group metadata is diagnostic
and must never be trusted on restart to signal an unverified PID.

## Checkpoint boundary

Factor an Agent Host exact-file reader/writer using the same security model as
workspace run events and provider config readers: every component is inspected
without following symlinks, opened identity is compared, size is bounded, and
temporary output is owner-only before atomic rename. Errors return stable codes
and no canonical path.

## Recovery

Recovery compares lease expiry with current time. A running node with a live
lease remains running. An expired lease clears process metadata and either
queues a retry or becomes failed when `attempts >= maxAttempts`. Store the
maximum attempts on the node so recovery has the same authority as claim/fail.
Existing records migrate with a conservative default matching prior behavior;
session nodes will explicitly use one attempt.

## Process custody

The next child will spawn the process and register a native cancellation handle.
This child supplies crate-private registration/unregistration/cancel-all APIs and
connects public Host cancel/shutdown to them. POSIX adapters own a process group;
Windows registration returns capability-required.

Cancellation is idempotent. Graceful signal, bounded wait, force kill, and final
unregister happen under native authority. Host state changes only after the
termination attempt is complete or a stable termination failure is recorded.

## Error contract

Replace raw `String` attempt/event errors with a stable code plus sanitized
message projection while retaining backwards-compatible deserialization for old
checkpoints. The sanitizer removes ANSI, controls, credential markers, and host
paths and caps size.

## Compatibility

No Tauri command gains command/process arguments. Existing Host API callers keep
their payloads. Migration of old checkpoints is deterministic and does not
delete completed receipts or replay succeeded nodes.
