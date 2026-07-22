# Issue #12 Current-HEAD Audit

Audit date: 2026-07-22

The eight disclosed finding classes were checked against the current working
HEAD before implementation. Result: five present, three partial, zero fully
fixed.

| Finding class | Status | Primary boundary |
| --- | --- | --- |
| Provider secret/host binding | Present | Proxy accepts independent provider id, kind/protocol, and URL before reading the selected secret |
| SSRF canonicalization and resolve/connect | Partial | Preflight DNS checks exist, but connect resolves again and IPv4-mapped IPv6 is incomplete |
| `save_assets` arbitrary write | Present | Caller destination bypasses the picker and existing symlink targets may be followed |
| `ai_native_read_file` arbitrary read | Present | Command accepts and reads a caller path directly |
| MCP project-root binding | Partial | Bundled entry is fail-closed; source `pnpm cutout:mcp` still falls back to cwd |
| Approval lease forgery | Present | Workspace JSON is unsigned and desktop apply checks only a non-empty approval id |
| Starter compiler injection | Partial | Some React values are escaped; Vue attributes and CSS token values are still raw |
| Git config/hooks and scan depth | Present | Git inherits config/hooks and both recursive scanners lack a depth ceiling |

Implementation must close each boundary and add focused adversarial tests before
issue closure. Public issue comments must not include exploit payloads.

## Post-implementation outcome

All eight finding classes are fixed in the reviewed working tree; none were
classified as not applicable.

| Finding class | Outcome | Verification boundary |
| --- | --- | --- |
| Provider secret/host binding | Fixed | Persisted provider id, enabled state, kind, effective protocol, origin, and base path are validated before the selected secret is read |
| SSRF canonicalization and resolve/connect | Fixed | Mapped/reserved addresses are rejected and validated DNS results are pinned into the no-redirect reqwest client; secure-client construction fails closed |
| `save_assets` arbitrary write | Fixed | Caller destinations are removed; each export uses a native picker plus canonical-root and no-follow/reparse regular-file writes |
| `ai_native_read_file` arbitrary read | Fixed | Reads are restricted to safe relative paths below `ai-native/imports`, with symlink, non-regular-file, and 100 MiB limits |
| MCP project-root binding | Fixed | Source and bundled MCP omit cwd fallback; project tools require explicit `CUTOUT_PROJECT_ROOT` while static discovery remains available |
| Approval lease forgery | Fixed | Every durable lease state is HMAC authenticated with a host key outside the workspace; desktop apply commands require a native confirmation and accept no caller-authored approval id |
| Starter compiler injection | Fixed | Vue/Nuxt attributes are escaped and CSS values reject breakout, URL, expression, and raw fallback interpolation |
| Git config/hooks and scan depth | Fixed | Git runs with sanitized configuration, hooks/helpers/external diff/file transport disabled, executable local config rejected, and both scanners cap depth at 64 |

Focused verification passed: 111 integrated Vitest tests, 104 Rust command
tests, Agent contract validation, TypeScript, lint, release authority/version
validation, and release-critical Playwright coverage. Full verification passed:
1642 Vitest tests, 107 Rust tests, production build, integration smoke, and
`git diff --check`.
