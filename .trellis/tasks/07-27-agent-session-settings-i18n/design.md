# Technical design

## Phase boundary

Phase A is a probe-only Settings surface. It inventories reviewed Agents and
projects sanitized installation/support/authentication facts. It does not offer
or contain a local Agent execution path.

The release blocker is filesystem read authority: stable `codex exec` has no
reviewed no-tools mode, and `--sandbox read-only` does not prove that Codex can
read only the authorized workspace. Preventing writes is not equivalent to
confining reads. Until a separately reviewed mechanism enforces workspace-only
reads, the canonical execution state is `filesystem-isolation-required`.

## Surface architecture

Keep one AI Settings section and split it with the existing shared `Tabs`
primitive:

```text
AI Settings
├── API providers
│   ├── configured providers
│   ├── reviewed API-key candidates
│   ├── add/edit provider
│   └── model routing
└── Local Agent sessions
    ├── probe-only trust/isolation statement
    ├── installed and blocked Agents
    └── remaining reviewed inventory
```

Refactor the current provider body into a provider-owned pane without changing
its list/add/edit view machine. `AgentSessionsPane` reads only the local inventory
and the probe service. It does not share ProviderForm, ProviderConfig, provider
drafts, model catalogs, provider routing, Agent composer, run events, or durable
Host lifecycle state.

Use full-width rows with separators and restrained status indicators rather than
a card per Agent. The Settings content pane remains the sole vertical scroll
owner. Stable columns and wrapping descriptions prevent long Chinese or blocked
state copy from changing control geometry or causing horizontal overflow.

## Probe contract and ownership

Native code owns a closed probe registry. The webview selects only a stable
Agent ID through a typed service or refreshes the closed set. It cannot choose an
executable, command, argv, path, environment, auth method, provider, endpoint,
login flag, or helper.

The Codex probe invokes only fixed `codex login status`, never `codex exec`, and
maps known output to:

```text
chatgpt | api-key | access-token | unauthenticated | unknown
```

Raw stdout/stderr is discarded natively because it may contain masked credential
material. No model request, login, browser, helper, Claude invocation, or
arbitrary tool runs during discovery, refresh, or automated tests.

The shared strict frontend projection contains only:

- stable Agent ID and display name;
- installation status;
- adapter/support status;
- fixed probe/version/platform status;
- sanitized auth class when available;
- one closed blocking reason, including `filesystem-isolation-required`,
  `vendor-approval-required`, `unsupported`, and `capability-required`;
- optional closed navigation target for the separate BYOK provider tab.

There is deliberately no `runnable`, `plan`, `runId`, prompt, output, progress,
cancel, result, executable, path, command, environment, PID, quota, account, or
credential field in the Phase A UI contract. Strict native and TypeScript
schemas reject unknown fields. Presentation maps enums exhaustively and cannot
derive execution readiness from `chatgpt` authentication.

## Data flow

```text
fixed 39-Agent inventory -------------------+
                                             +-> strict UI projection -> Settings rows
fixed native capability/auth probe -> sanitize+

Settings refresh -> repeat fixed probe -> replace query state
```

This flow terminates in Settings. It has no arrow to the Agent composer,
ProviderConfig/model routing, Host claim, approval lease, child process, run
event, or result renderer.

## Settings navigation

Add `agent-sessions` to `SettingsTarget.anchor`. `SettingsDialog` passes the
target into the AI section so the owning tab is selected before the existing
focus effect runs. `model-routing` always activates the provider tab;
`agent-sessions` activates the local-session tab. Normal Settings entry defaults
to providers.

API-key/access-token and Claude BYOK navigation switches to the provider tab and
focuses the existing provider connection surface. It does not import a key,
create a draft, choose a provider, or execute a fallback automatically.

## User-facing state matrix

| Evidence | Visible primary state | Visible blocking/next step | Runnable |
| --- | --- | --- | --- |
| Codex installed, supported, `chatgpt`, probe passed | Signed in with ChatGPT | Filesystem isolation required | No |
| Codex `api-key` | Authenticated with API key | Configure an API provider | No |
| Codex `access-token` | Authenticated with access token | Configure an API provider | No |
| Codex unauthenticated | Not signed in | Sign in with Codex outside Cutout, then refresh | No |
| Codex unknown/probe/version/platform failure | Exact sanitized probe/capability state | Session execution unavailable | No |
| Claude Code installed | Claude Code detected | Vendor approval required | No |
| Any unsupported Agent | Exact inventory state | Session delegation not supported | No |
| Not installed/permission required | Exact inventory state | External installation/permission next step | No |

`Signed in with ChatGPT` is an authentication fact only. It must not be combined
with `allowance`, `quota`, `ready`, `available to run`, or similar execution
language in Phase A.

## Localization and accessibility

All copy uses explicit Lingui IDs. Runtime/vendor names stay verbatim; status,
blocking reason, next step, refresh, and accessibility strings are localized.
English and Simplified Chinese receive semantic review. Japanese, French, and
Spanish receive the same IDs with non-empty translations to preserve shipped
catalog parity.

The tab list has a localized accessible label. Rows expose one primary fact and
one blocking/next-step phrase without relying on color. Refresh is one fixed-size
Lucide icon button with localized tooltip/name. Probe activity and completion use
a polite status region; repeated row statuses are not announced as alerts.
Keyboard focus reaches the requested Settings target on desktop and mobile.

## Phase B gate

No Phase B component, permission, command, feature flag, or dormant route lands
with Phase A. A future execution task must first produce reviewed evidence for:

- workspace-only filesystem read confinement;
- a closed no-tools runtime surface or equivalent independently enforced tool
  denial;
- exact argv/environment/network/process custody;
- approval, cancellation, timeout, shutdown, and terminal result contracts;
- sanitized bounded output with no secret or host-path leakage.

Only after those gates pass may a separate plan introduce composer selection,
consent, process execution, progress, cancellation, or advisory results.

## Compatibility and rollback

- Existing providers, imported credentials, provider drafts, model bindings,
  persisted provider records, Agent composer, and run history are unchanged.
- The public CLI/MCP/headless limitation remains truthful: there is no bundled
  provider/session executor.
- Rollback removes the probe-only session tab and leaves provider Settings, the
  fixed inventory, BYOK credentials, and all Agent-owned session files intact.
- No migration reads, deletes, rewrites, or persists provider keys or Agent-owned
  session material.
