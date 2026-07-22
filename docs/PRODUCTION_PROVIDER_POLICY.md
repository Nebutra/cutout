# Production Provider Policy

Every paid or remote provider execution is guarded before invocation by a versioned policy:

- request/minute and concurrency quotas;
- monthly cost ceiling and per-request estimate;
- hard timeout and cancellation signal;
- explicit allowed deployment region;
- required content-safety decision and blocked categories;
- telemetry disabled unless the user opts in, never including content or credentials.

## Host security boundary

- Desktop paid actions may require a short-lived `cutout.capability-lease.v1` bound to the exact run subject, request digest, approval id and approved scopes. Expired, revoked or replayed authority fails closed and produces no provider call.
- Provider secrets remain in the host keychain. Before reading one, Rust reloads the persisted provider id and binds the secret to that record's enabled kind, effective protocol, exact origin and configured/default base-path prefix. The WebView never receives the credential; Rust assembles the provider-specific authentication header immediately before transport.
- Remote provider URLs are HTTPS and provider/vendor allowlisted. Literal and DNS-resolved loopback, private, link-local, multicast, IPv6 ULA and reserved destinations are rejected. The validated DNS socket addresses are pinned into the HTTP client so connect cannot re-resolve to a different address. Redirect following is disabled, preventing credential forwarding to a second origin.
- Explicit Ollama, vLLM and LM Studio profiles are the exception: they permit HTTP(S) only to loopback and do not broaden access to the LAN.
- Credential-shaped response headers, cookies and authentication challenges are removed before the response crosses IPC.

The controlled Node command host is separate from provider transport. It accepts a fixed command enum, uses `shell: false`, resolves paths under the canonical workspace without symlinks, and copies only explicitly allowlisted non-secret environment variables. It does not provide an arbitrary shell.

Current truthful host limitations are `capability-required`: kernel CPU quotas, general Node network isolation, and reliable Windows process-tree cancellation until a Job Object adapter exists. POSIX process groups, wall-clock time and output-byte limits are enforced.

The integration smoke harness is credential-gated. CI and developer machines without an injected
host must receive `capability-required`, not a simulated success. Remote cloud/team deployment is
disabled until `cutout.deployment-readiness.v1` reports every configuration, health, privacy and
backup check passed.
