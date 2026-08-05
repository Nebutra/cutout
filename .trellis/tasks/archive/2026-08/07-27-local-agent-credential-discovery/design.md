# Technical design

## Architecture

Introduce a native `LocalAgentRegistry` beside provider discovery. Each entry
owns root resolution, exact file probes, schema parsers, CLI detection, and the
actions that the tool can support. Discovery is additive: existing provider
candidates remain compatible while a richer sanitized Agent-source inventory
drives the settings UI.

The inventory distinguishes three independently authorized capabilities:

1. `inspect`: sanitized source metadata only.
2. `import_api_key`: native re-read and import into Cutout local credentials.
3. `delegate_session`: invoke the original tool runtime through a controlled
   adapter without copying its OAuth/session material.

## Registry contract

Each registry entry contains a stable tool ID, labels, root resolvers, fixed
relative paths, parser/version identifiers, CLI binary identities, and supported
actions. Root resolvers may consume only reviewed environment/profile variables.
They return canonical roots internal to Rust; no IPC command accepts a path.

Initial credential adapters:

| Tool | Reviewed root | Exact sources | Initial actions |
| --- | --- | --- | --- |
| Codex | `$CODEX_HOME` or `~/.codex` | `auth.json`, `config.toml` | API-key import; delegated session after CLI capability proof |
| Claude Code | `~/.claude` | `settings.json` | API-key import; delegated session after CLI capability proof |
| Pi | `~/.pi/agent` | `auth.json`, `models.json`, `settings.json` | API-key import; delegated session after CLI capability proof |
| OMP | reviewed default/profile roots ending in `agent` | `agent.db`, `models.yml`, `models.yaml`, `config.yml` | YAML API-key import; official gateway/CLI delegation when verified |
| OpenCode | XDG config/data roots | config plus `auth.json` | discriminated API-key import; OAuth delegated |
| Gemini CLI | `GEMINI_CLI_HOME` or `~/.gemini` | `settings.json`, `oauth_creds.json` | environment API-key import; OAuth delegated |
| Qwen Code | `QWEN_HOME` or `~/.qwen` | `settings.json`, `oauth_creds.json` | literal/env API-key import; OAuth delegated |
| Kimi Code CLI | `~/.kimi` | `config.toml`, legacy `config.json`, `credentials/` | literal provider API-key import; OAuth delegated |
| Mistral Vibe | `VIBE_HOME` or `~/.vibe` | `config.toml`, `.env` | reviewed env/literal API-key import; keyring delegated |

The full inventory registry additionally includes every Agent in the pinned
Paseo 2026-07-27 catalog. Registry coverage and credential-adapter coverage are
separate dimensions:

- `inventory`: all 39 entries have IDs, labels, local CLI identities, provenance,
  and an installation/capability state.
- `source probe`: enabled only after exact config roots/files are documented.
- `API-key import`: enabled only after the secret schema and provider protocol
  are reviewed and tested.
- `session delegation`: enabled only after a stable local non-interactive/ACP
  runtime is verified and authorized.

This lets the UI truthfully show every common Agent immediately without turning
unknown config formats into a generic credential crawler.

The pinned catalog is compiled into the app and has no runtime network fetch.
Catalog maintenance records the upstream URL, snapshot date, and evidence. The
registry rejects duplicate IDs, empty binary identities, installer-only commands,
and commands whose first local executable cannot be safely probed. Entries whose
Paseo launch form starts with `npx -y` or `uvx` are never executed during
discovery; Cutout checks only already-installed local binaries or package state.

## Native read boundary

Reuse and generalize the existing exact-file reader: canonicalize the root,
reject symlink components and non-regular files, cap file size, and parse with a
typed schema. JSON/TOML/YAML parsers receive bytes only inside Rust. SQLite is
opened read-only with immutable/query-only behavior where supported and runs
fixed metadata queries that never select credential payload columns.

Parser output uses an internal secret-bearing enum. That enum is never
serializable. The IPC DTO is constructed separately and contains only sanitized
metadata. Import commands receive a candidate ID and authorization lease, then
look up the registry entry and re-read the secret natively.

## UI and authorization flow

The settings screen groups discovered sources by Agent. A row shows installation
status, provider, source type (`API key` or `Agent session`), sanitized location,
and availability. Actions are capability-specific:

- `Import API key`: previews the source/provider destination, asks for explicit
  confirmation, performs a non-billable credential/catalog check, then imports.
- `Use Agent session`: previews the executable, account/source label, workspace
  scope, and execution boundaries; after confirmation it creates an opaque
  binding and authorization receipt.
- `Grant access`: appears only after a read is blocked. The native picker grants
  an exact Agent root, after which only registry paths may be resolved below it.

Permission denial, stale files, missing binaries, and unsupported schemas are
stable non-destructive states. Automatic discovery must not trigger a system
permission dialog; prompts follow a user action.

## Delegated session boundary

Add a provider execution adapter only for a tool with a verified, stable,
non-interactive interface. The adapter resolves an allowlisted installed binary,
constructs argv without a shell, passes task input through the documented
channel, fixes the workspace root, strips non-allowlisted environment variables,
enforces wall-clock/output limits, supports cancellation, and redacts output.

The source CLI owns OAuth refresh and provider traffic. Cutout persists only the
tool ID, binary fingerprint/version, approved workspace/scope, and an opaque
binding/receipt. It does not read a token merely to pass it back to the CLI.

If no stable interface is verified for a tool, the registry reports
`session_detected` plus `delegation_unavailable` and a localized reason. This is
preferable to an unsafe token bridge or an inaccurate product claim.

## Compatibility and rollout

Phase the change behind additive data contracts:

1. Land the pinned 39-Agent inventory and registry-backed sanitized discovery
   while preserving existing provider candidate IDs where possible.
2. Land the nine reviewed Tier A credential adapters, preserving current
   Codex/Claude behavior, then add other evidence-backed adapters in reviewed
   batches.
3. Add permission UX and native root grants.
4. Add delegated adapters individually after executable/version/capability
   probes and packaged-app tests pass.
5. Update `cutout.agent-capabilities.json`, protocol/docs/permissions, and run
   `pnpm agent:validate` only when delegated execution is genuinely present.

Rollback can disable individual registry actions without removing discovered
metadata or stored provider configurations. Existing imported providers remain
usable if a new Agent adapter is disabled.

## Security decisions

- Closed registry instead of directory similarity or recursive scanning.
- Exact typed parsers instead of regex/searching arbitrary files.
- Separate secret-bearing native types from serializable metadata DTOs.
- Separate API-key import authorization from session delegation authorization.
- Never execute helper syntax found in configuration.
- Never infer subscription entitlement or remaining quota from local state.
