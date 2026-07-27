# Tier A credential adapter contract

Reviewed 2026-07-27 against the parent research matrix, existing Cutout provider
contracts, released Codex/Claude behavior, and source-level adapter research.
This is implementation evidence, not permission to search other paths.

## Shared invariants

- Exact roots/files only; no recursion or frontend paths.
- Strict env-name grammar and allowlists; values stay native.
- Only explicit tagged API-key variants are importable.
- OAuth, bearer, helper, keyring, and unknown variants are non-importable.
- Custom endpoints require explicit supported protocol and exact origin binding.
- Secret selectors are internal; serialized rows contain sanitized labels only.

## Claude Code

- Root: `CLAUDE_CONFIG_DIR`, otherwise `~/.claude`.
- Exact files: `settings.json`; `.credentials.json` for session presence only.
- Import: non-empty root `env.ANTHROPIC_API_KEY`.
- Display only: `env.ANTHROPIC_AUTH_TOKEN`, `claudeAiOauth`, `apiKeyHelper`.
- Binding: Anthropic Messages; validated base URL or first-party Anthropic base.

## Codex

- Root: `CODEX_HOME`, otherwise `~/.codex`; legacy auth fallback at
  `~/.config/codex/auth.json` only when primary auth is absent.
- Exact files: `auth.json`, `config.toml`.
- Import: top-level non-empty `OPENAI_API_KEY`; model provider `env_key` with
  strict env name and supported `wire_api`.
- Display only: `tokens.*`, bearer/auth/helper/command fields.
- Binding: `openai` is first-party; custom entries need explicit base/protocol.

## OpenCode

- Roots: `OPENCODE_CONFIG_DIR` or XDG/default config; XDG/default data auth.
- Exact files: `opencode.json`/`opencode.jsonc`, `auth.json`.
- Auth is a provider-ID map with strict union: `{type:"api",key:string}` is
  importable only for known binding; `{type:"oauth",...}` is display-only.
- Unknown/missing type or provider mapping is unsupported. JSONC uses a parser.

## Pi Agent

- Root: `PI_CODING_AGENT_DIR`, otherwise `~/.pi/agent`.
- Exact files: `auth.json`, `models.json`, metadata-only `settings.json`.
- Auth union: `{type:"api_key",key:string}` importable; OAuth display-only.
- Model provider env references require typed provider/base/protocol metadata.

## OMP

- Agent root: `PI_CODING_AGENT_DIR`, or `PI_CONFIG_DIR`/default plus `agent`.
- Exact files: Pi-compatible `auth.json`/`models.json`; `models.yml` then
  `models.yaml`; metadata-only `agent.db`/`config.yml`.
- YAML accepts only typed literal/env key variants with binding metadata.
- Reject tags, merge keys, anchors/aliases, duplicates, helpers, unknown forms.
- SQLite queries never select credential payload data and never resolve a key.

## Gemini CLI

- Root: `GEMINI_CLI_HOME`, otherwise `~/.gemini`.
- Exact files: `settings.json`; `oauth_creds.json` presence only.
- Import only process env `GEMINI_API_KEY`, then `GOOGLE_API_KEY` precedence.
- OAuth/Vertex/ADC/keychain modes are display-only.
- Binding: Google Generate Content and first-party Google API base.

## Qwen Code

- Root: `QWEN_HOME`, otherwise `~/.qwen`.
- Exact files: `settings.json`; `oauth_creds.json` presence only.
- Import exact non-empty `security.auth.apiKey` or a pinned env-reference field.
- Native DashScope maps to Chat Completions and first-party DashScope base.
- Custom mode needs an explicit supported protocol and public HTTPS origin.

## Kimi Code CLI

- Root: `~/.kimi`.
- Exact current `config.toml`; legacy `config.json` only when current is absent.
- Separate pinned schema IDs; accept only reviewed provider API-key/env fields.
- Known Moonshot hosts map to Moonshot Chat. Unknown Kimi/custom origins remain
  non-importable until a dedicated kind/host policy or reviewed binding exists.
- Never crawl credential directories.

## Mistral Vibe

- Root: `VIBE_HOME`, otherwise `~/.vibe`.
- Exact files: `config.toml`, `.env`.
- Config declares strict `api_key_env_var`; process env wins, then exact dotenv
  key fallback.
- Dotenv rejects export, duplicates, interpolation, command substitution,
  backticks, multiline values, controls, and unrelated key extraction.
- Binding: Mistral Chat and first-party Mistral API base unless reviewed explicit.

## Required tests

All nine: positive, absent, malformed, unknown union/schema, oversized,
non-file, symlink root/component/file, permission failure, sentinel-secret
redaction, native re-read, source/binding drift, and closed provider mapping.

Negative import gates: OAuth/bearer/helper/keyring/unknown variants, stale draft,
conflict, persistence rollback, and no caller path. Adapter-specific tests cover
Codex legacy/fallback, OpenCode JSONC, Pi APIs, OMP YAML hazards/SQLite payload
exclusion, Gemini env precedence, Qwen literal/custom binding, Kimi current vs
legacy precedence, and Vibe dotenv rejection.
