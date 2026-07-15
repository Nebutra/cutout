# Integration Release And Readback Checklist

Status: production acceptance contract. A checked box requires attached receipt evidence.

## OAuth providers: GitHub, Notion, Canva Connect

- Desktop host owns client secrets, PKCE verifier, access tokens and refresh tokens.
- Cutout receives only an opaque `SecretHandle` bound to provider and session.
- Authorization URL uses HTTPS and the callback is exactly `cutout://oauth/callback`.
- Callback state/request ID is single-use and provider/session substitution is rejected.
- Refresh preserves session identity; revoke invalidates both host credentials and Cutout state.
- A selected-resource readback succeeds with least-privilege scopes.
- Publish preview and base revision are shown before approval; readback confirms the remote result.
- Rate-limit, timeout, region, cost and content-safety failures return structured receipts.

## Foreground plugins: Figma, Obsidian, Framer, Canva Apps

- Package manifest validates against the vendor's documented surface.
- Installation is performed in a clean host profile and the plugin starts only by user action.
- Handshake binds host kind, host version, session ID and expiry.
- Preview/readback runs before apply; stale node/file/base revisions produce conflicts.
- Apply requires an explicit approval ID and returns immutable result evidence.
- Figma closes after apply and commits an undo boundary. Framer publishes only from approved staging.
- Canva export/publish retains required user interaction and does not impersonate Connect API.

## Local MCP/CLI: Pencil and Paper

- Host process is discovered, version checked and scoped to the selected/open document.
- `.pen` schema changes invoke the versioned migration capability before writes.
- Paper requires the foreground desktop MCP host.
- Process timeout/cancellation terminates the operation without a success receipt.

Run `node scripts/integration-smoke.mjs` without credentials in CI. The expected result is
`capability-required` for every remote/host integration. Credentialed probes run only in a
protected release environment with host-owned secret handles.
