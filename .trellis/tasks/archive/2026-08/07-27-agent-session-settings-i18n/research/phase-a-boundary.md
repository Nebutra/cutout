# Phase A release boundary

## New release-blocking evidence

- Stable `codex exec` has no reviewed mode that proves all Agent tools are
  disabled.
- `--sandbox read-only` constrains writes but is not evidence that filesystem
  reads are limited to Cutout's authorized workspace.
- An advisory run could therefore read host files outside the workspace even if
  it cannot modify them. This violates Cutout's filesystem authority contract.

## Decision

The current release is probe-only:

- fixed installation/capability inspection remains allowed;
- fixed `codex login status` may be mapped to a sanitized auth enum without a
  model request or session-file read;
- `chatgpt` means only `Signed in with ChatGPT`;
- every execution state is blocked as `filesystem-isolation-required`;
- API-key/access-token Codex sessions remain non-runnable and use the separate
  BYOK provider path;
- Claude remains `vendor-approval-required`;
- composer selection, plan/consent, process launch, progress/cancel, output, and
  advisory results are deferred.

## Phase B evidence gate

Execution cannot be reconsidered until a reviewed contract proves both
workspace-only filesystem reads and a closed no-tools surface, in addition to
fixed argv/environment/network/process custody and sanitized bounded output.
Read-only behavior alone does not satisfy this gate.
