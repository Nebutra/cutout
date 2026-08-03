# Add Codex capability and authentication probe

## Goal

Let a user explicitly check whether a reviewed local Codex CLI is installed,
supported, and authenticated without reading credential files or making a
model request. Present only sanitized capability and authentication metadata.

## Background

- Cutout may inventory the presence of a local Agent runtime, but inventory is
  not authority to execute it or inspect its credentials.
- Stable Codex `exec` currently has no reviewed, enforceable prompt-only mode
  that disables all tools. `--sandbox read-only` prevents writes but does not
  prove that reads are confined to the authorized workspace, and `-C` only
  selects a working directory.
- A repository-controlled prompt or instruction could therefore cause Codex to
  read another host path and send that content to the model. Codex model
  execution is release-blocked until that boundary is enforceable.
- Codex-owned `login status` can report an authentication category without
  Cutout reading or copying session material. Its raw output may contain
  sensitive fragments and must remain native-process-local.

## Requirements

- Phase A is probe-only. It must not expose plan, apply, spawn, prompt, JSONL,
  result, retry, resume, or cancellation APIs for Codex model execution.
- Run a probe only after a deliberate user action. Agent inventory remains
  metadata-only and must never invoke Codex automatically.
- Resolve only the fixed canonical `codex` alias. Initially support exactly one
  reviewed version, `0.145.0`; a range or additional version requires separate
  evidence and review.
- Re-resolve and revalidate executable identity immediately before every probe.
  On macOS, require the reviewed OpenAI Team ID `2DC432GLL2`. Other platforms
  remain capability-blocked until an equivalent identity contract is reviewed.
- Execute only fixed, bounded `codex --version` and `codex login status`
  commands with no shell. Both commands must use the same validated executable
  and the same native-owned environment policy.
- Clear the inherited environment and rebuild a minimal positive allowlist.
  Credential variables, proxy variables, provider overrides, caller-selected
  variables, profiles, config flags, and arbitrary paths are forbidden.
- Cutout must never read Codex authentication files. A reviewed absolute
  `CODEX_HOME` may be passed only so the Codex process performs its own normal
  lookup; it is not returned to the webview or persisted in probe results.
- Enforce short timeouts and strict stdout/stderr byte limits. Terminate the
  probe process on timeout, overflow, app shutdown, or identity mismatch.
- Map native output to only `chatgpt`, `api-key`, `access-token`,
  `unauthenticated`, or `unknown`. Raw stdout/stderr, masked key fragments,
  executable paths, home paths, and unrecognized text must not cross IPC,
  enter logs, or persist.
- Only `chatgpt` may be described as using the user's existing Codex sign-in.
  `api-key` and `access-token` are truthful authentication states but are not
  subscription reuse. Never claim remaining allowance, quota, entitlement, or
  billing status.
- Return stable blocked/error codes for missing, unsupported, unsigned,
  unauthenticated, unknown-output, timeout, overflow, and platform-blocked
  states. Do not fall back to a guessed executable or OpenAI-compatible API.

## Acceptance Criteria

- [ ] Codex is never invoked by inventory, startup, background refresh, or any
      path other than the explicit probe action.
- [ ] A probe uses only the revalidated canonical executable, exact reviewed
      version and identity, fixed argv, cleared/allowlisted environment, bounded
      IO, timeout, and native process cleanup.
- [ ] The renderer receives only sanitized capability metadata and one of the
      five approved authentication classes; raw process output and host paths
      never cross IPC or persist.
- [ ] No credential/session file is opened, serialized, copied, migrated, or
      exposed by Cutout.
- [ ] UI copy distinguishes ChatGPT sign-in from API-key/access-token auth and
      makes no quota, allowance, billing, or execution-availability claim.
- [ ] Unsupported versions, invalid signatures, non-macOS platforms, unknown
      output, missing auth, timeout, and overflow fail closed with stable states.
- [ ] No Codex model request, advisory run, workspace read, patch generation,
      apply, or session executor is reachable in this release.
- [ ] Focused native/IPC/frontend tests, i18n checks, `pnpm agent:validate`, and
      `git diff --check` pass for the implemented Phase A contract.

## Out Of Scope

- Codex `exec`, prompts, JSONL decoding, advisory results, durable run events,
  cancellation, resume, retry, patch preview, approval, or apply.
- Reading/importing Codex OAuth, session, API-key, or access-token files.
- Quota, allowance, balance, billing, entitlement, or account metering.
- Support for unreviewed Codex versions, aliases, wrappers, or platforms.
- Claude runtime execution or Claude subscription reuse.

## Phase B Release Blocker

Codex execution may be planned only after either enforceable workspace read
confinement exists or a stable no-tools contract has been source-reviewed and
shown to prevent repository instructions from causing host-file reads. Phase B
requires a new security review and is not activated by completion of Phase A.
