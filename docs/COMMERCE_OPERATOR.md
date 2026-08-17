# Closed Commerce Operator

`cutout-commerce-operator` is the non-GUI production entry for one evaluator-
owned Commerce job. It is a separate product binary and is not discoverable
through `cutout.control.v1`, the public CLI, or MCP.

The operator reads one bounded UTF-8 JSON envelope from standard input. Its
public command discriminant is exactly `preflight`, `run`, `recover`, `admit`,
`status`, or `cancel`. Every command carries one opaque job id; run commands
carry a strict evaluator package and admission carries only evaluator completion.
The Host reloads the exact exclusively published pending document for that job;
the caller cannot resubmit or replace it. Caller-selected roots,
destinations, Provider URLs, credentials, native command names, and arbitrary
payload forwarding are rejected.

Results are written atomically under the Host-owned private app-data directory:

```text
commerce-operator/jobs/<opaque-job-id>/
  preflight.json
  pending.json
  admitted.json
  status.json
```

Only the filename for the completed command is returned on standard output.
Changed recovery input, concurrent job transitions, symlink storage, oversized
input, partial publication, and cross-document drift fail closed. Cancellation
terminates the job process group so source ingestion and Provider operations
receive the same abort boundary; deterministic receipt request ids remain
separate from the job-scoped cancellation UUID.

Build the four adjacent release artifacts with:

```bash
CUTOUT_COMMERCE_EVALUATOR_PUBKEY='<reviewed Minisign public key>' \
CUTOUT_COMMERCE_CODESIGN_IDENTITY='<Developer ID Application identity>' \
pnpm commerce:operator:build
```

The build requires product, Cargo, Tauri, capability, plugin and packaged runtime
version `0.1.21`, rejects a drifted packaged capability copy, and refuses to
compile without a structurally valid Minisign evaluator public trust root. On
macOS it also requires a real code-signing identity. The credential setup binary
and native Host share one signed designated requirement, so rebuilding the
release does not invalidate their private Keychain namespace.
The Design OS admitted-evidence promoter additionally verifies that exact
Developer ID identifier and Team requirement before it invokes the fixed native
Host; an owner-controlled replacement at the expected path is not evidence.
At runtime the signed macOS operator likewise verifies the adjacent runner's
pinned identifier and Team requirement, and the runner verifies the native Host
before every request. File adjacency and ownership are not sufficient authority.

`cutout-commerce-credential-setup` is the only credential bootstrap path for
the closed operator. It accepts one bounded strict JSON document on standard
input with protocol `cutout.commerce-credential-setup.v1` and a `secret` field,
stores that secret for the fixed `dashscope-qwen-image3` Provider, and returns
only `{ configured: true }`. It accepts no Provider id, URL, path, command or
output destination and never echoes the secret. This setup binary is not part
of the six-command operator protocol, public CLI, MCP or Agent discovery.

A `0.1.20` challenge is not valid for this operator build. The evaluator
private key is never an operator input or environment variable.
