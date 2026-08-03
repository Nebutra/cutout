# Reviewed runtime research

## Codex CLI 0.145.0

### Probe evidence

- Canonical executable alias: `codex`.
- Fixed `codex --version` can establish the exact reviewed version.
- Fixed `codex login status` can be mapped natively to an authentication class
  without Cutout reading Codex auth files or making a model request.
- Raw login-status output may contain a masked API-key fragment. It must never
  cross IPC, enter logs, or persist; only the sanitized enum may leave native
  parsing.
- Approved auth enum: `chatgpt`, `api-key`, `access-token`,
  `unauthenticated`, or `unknown`.
- Only `chatgpt` represents an existing Codex sign-in suitable for truthful UI
  wording. API-key/access-token auth is not subscription reuse, and login status
  provides no remaining allowance, quota, billing, or entitlement evidence.
- The reviewed installed macOS binary is signed by OpenAI Team ID
  `2DC432GLL2`. Exact version, platform signature, Team ID, and executable file
  identity must be revalidated immediately before every probe.
- Other platforms remain capability-blocked until equivalent identity evidence
  and process behavior are reviewed.

### Execution blocker

- Stable `codex exec` does not expose a reviewed, enforceable prompt-only mode
  that disables all tools.
- `--sandbox read-only` prevents workspace writes but does not prove that reads
  are restricted to the authorized workspace.
- `-C <workspace>` selects the current working directory; it is not a
  filesystem read boundary.
- Repository instructions can influence model/tool behavior. Without read
  confinement or no-tools enforcement, Codex could read another host file and
  transmit its content to the model.
- Disabling web/network features does not solve host filesystem disclosure.
  Process groups, timeouts, approvals, and JSONL validation also do not solve
  that authority gap.
- Therefore `codex exec`, prompts, JSONL decoding, advisory results, durable run
  events, cancellation/resume/retry, and patch plan/apply are release-blocked.

Phase B may reopen only when enforceable workspace read confinement exists or a
stable no-tools contract has been source-reviewed and proven to prevent host
reads induced by repository instructions.

Evidence: installed CLI help/version/signature and matching OpenAI
`rust-v0.145.0` login/auth/non-interactive source and official CLI/auth docs.

## Claude Code 2.1.220

- `claude --print --output-format stream-json` can technically invoke the local
  runtime, and `--safe-mode` affects customization loading.
- Official Agent SDK guidance says third-party products may not offer
  `claude.ai` login or rate limits without prior Anthropic approval.
- Cutout therefore ships no Claude session executor and reports
  `vendor-approval-required`. BYOK Anthropic API-key support remains a separate
  provider capability.
- Do not represent technical CLI availability as product/legal approval, and do
  not display Claude subscription allowance or rate-limit claims.

Evidence: official setup, CLI, headless, auth, permission, and Agent SDK docs;
installed package metadata/version and signed binary identity.

## Existing Cutout Host

- Opaque authorized-workspace handles and durable Host claims are reusable for
  future process authority.
- Rust recovery currently requeues running nodes rather than preserving valid
  leases; renderer heartbeat failure does not itself stop native effects.
- Rust Host lacks provider-process PID/process-group custody, uses checkpoint IO
  that needs stronger symlink/file-identity guarantees, locks by handle rather
  than canonical root, and can persist raw caller error strings.
- The Host hardening child must address these issues before future runtime
  execution, but Host hardening does not resolve Codex filesystem read
  confinement and must not enable an executor in Phase A.

Evidence: `src-tauri/src/commands/agent_host.rs`,
`src/agent-host/durable-host.ts`, `src/agent-host/durable-effect.ts`,
`src-tauri/src/commands/workspace_bridge.rs`, and native approval/lease code.

## Release conclusion

The reviewed release boundary is:

- allow explicit-user-gesture Codex capability/version/signature/auth probing;
- return only sanitized metadata and make no model request;
- keep inventory metadata-only;
- keep Codex execution blocked pending a new Phase B security review;
- keep Claude execution blocked pending vendor approval.
