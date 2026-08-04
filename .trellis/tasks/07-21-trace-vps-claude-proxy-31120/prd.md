# Trace VPS Claude proxy 31120

## Goal

Produce a layered connectivity report for 123.207.210.89:31120, compare against 31368, and determine whether local loopback, routing, proxy CONNECT, TLS, SNI, or upstream forwarding is failing.

## Requirements

- Trace the local route to `123.207.210.89` and prove whether traffic can be
  captured by loopback, local proxy environment variables, or `NO_PROXY`.
- Test TCP reachability to ports `31120` and `31368` under equivalent
  conditions.
- Inspect the HTTP proxy `CONNECT` exchange and identify the exact stage at
  which HTTPS traffic fails.
- Test multiple TLS targets and compare `31120` with the known-working
  `31368` endpoint on the same VPS.
- Report confirmed evidence separately from server-side causes that require
  VPS configuration or logs to distinguish.
- Do not expose credentials or make persistent network/server changes.

## Acceptance Criteria

- [x] The report states the resolved destination and selected local route.
- [x] The report includes TCP, HTTP CONNECT, and TLS results for both ports.
- [x] The report determines whether local loopback is involved.
- [x] The report narrows the failure to a specific network/proxy layer.
- [x] The report provides targeted VPS-side commands for the remaining root
      cause checks, if local evidence cannot distinguish them.

## Out of Scope

- Changing VPS firewall, proxy, routing, or account configuration.
- Reading or transferring Claude account credentials.

## Confirmed Background

- `31368` completes an HTTPS CONNECT tunnel and TLS handshake to
  `api.anthropic.com`.
- `31120` accepts TCP and returns `HTTP/1.1 200 Connection established`, then
  closes or resets during TLS immediately after the client hello.
- The same `31120` TLS behavior occurs for Anthropic, OpenAI, GitHub, and
  Cloudflare targets.
