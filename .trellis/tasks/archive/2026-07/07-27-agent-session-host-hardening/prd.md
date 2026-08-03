# Harden native Agent Host process authority

## Goal

Make the Rust Agent Host safe for later local Agent child-process custody,
lease-aware recovery, canonical locking, hardened checkpoint IO, and
cancellation without enabling a runtime yet.

## Background

- Rust recovery currently requeues every running node immediately, including
  nodes whose lease has not expired.
- Renderer-owned durable effects ignore heartbeat failure and cannot terminate
  a native child process.
- Host checkpoint IO does not inspect every path component or opened-file
  identity, locks are keyed by opaque handle, and persisted errors accept raw
  caller text.
- The later Codex adapter requires native process-group custody and one-attempt
  semantics before any subprocess can be enabled.

## Requirements

- Key Host locks by canonical authorized workspace identity, so multiple opaque
  handles for one root cannot race.
- Harden `.cutout/agent-host-state.json` reads/writes: reject symlink
  components/files, require regular bounded UTF-8 JSON, detect identity changes,
  write owner-only temporary files, fsync where supported, and atomically rename.
- Recovery preserves running nodes with unexpired leases. Expired running nodes
  become retryable only when attempts remain; non-retryable session nodes fail
  rather than silently respawn.
- Persist only stable error codes plus bounded sanitized messages. Credentials,
  ANSI, controls, absolute host paths, and raw stderr cannot enter Host state.
- Add native process custody primitives keyed by canonical workspace/run/node:
  register one process group, heartbeat/lease watchdog hooks, idempotent cancel,
  unregister on terminal exit, and app-shutdown cleanup.
- POSIX cancellation sends an interrupt/termination signal to the process group,
  then force-kills after a bounded grace period. Windows reports
  `capability-required` until Job Object custody exists.
- `agent_host_run_cancel` and lost/expired lease paths terminate a registered
  child before recording terminal cancellation/failure.
- Do not expose caller-selected PID, command, path, signal, or process-group ID
  through Tauri IPC. The later native executor is the only registration owner.
- Preserve existing Agent Host command payloads and durable effect behavior for
  current non-process consumers.

## Acceptance Criteria

- [ ] Unexpired leases survive recovery; expired leases follow retry policy and
  one-attempt session nodes do not restart.
- [ ] Two workspace handles resolving to one canonical root share one Host lock.
- [ ] Symlink component/file, non-file, oversized, malformed, permission, and
  identity-change checkpoint cases fail closed without host-path leakage.
- [ ] Raw credential/path/ANSI/control-bearing errors are rejected or sanitized
  before persistence and IPC.
- [ ] A registered POSIX child process group is terminated on explicit cancel,
  lease loss/expiry, timeout hook, and shutdown cleanup; repeated cancel is safe.
- [ ] No public command accepts a PID, executable, argv, environment, or path.
- [ ] Existing Rust/TypeScript Agent Host lifecycle and durable-effect tests pass.

## Out Of Scope

- Spawning Codex, Claude, or any other Agent.
- Runtime auth/version probes, JSONL parsing, approval UI, or session settings.
- Windows process execution before Job Object support.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
