# Reviewed Agent credential adapters

## Goal

Add exact-path, typed credential-source adapters for common Agents so Cutout can
show sanitized availability and explicitly import supported API keys without
copying OAuth/session tokens or executing helpers.

## Background

- The common inventory registry is complete and pins all 39 Paseo Agents.
- `provider_discovery.rs` already owns sanitized provider candidates, transient
  checked drafts, native secret resolution, connection checks, and atomic
  provider/key persistence.
- Claude Code discovery currently supports `env.ANTHROPIC_API_KEY`.
- Commit `bf03bfe` previously added Codex top-level `auth.json.OPENAI_API_KEY`
  support, but that behavior is absent from current `main` and must be restored.
- The parent research matrix identifies nine Tier A adapters with reviewed
  exact roots and schema discriminants. It does not authorize generic secret
  crawling or copying OAuth/session state.

## Requirements

- Depend on the stable inventory registry from `07-27-common-agent-inventory`.
- Each adapter records official/source evidence, reviewed roots, exact files,
  schema/version discriminants, provider protocol, and supported actions.
- Initial proven adapters cover Claude Code, Codex, OpenCode, Pi, OMP, Gemini
  CLI, Qwen Code, Kimi Code CLI, and Mistral Vibe. Additional Paseo Agents land
  in reviewed batches as evidence becomes complete.
- API-key import re-reads the registered source in native code after explicit
  confirmation; frontend IPC never supplies or receives the secret.
- OAuth, bearer, subscription, helper, and unknown entries are display-only and
  non-importable.
- Readers reject symlinks, non-files, oversized inputs, unknown schemas, helper
  syntax, arbitrary paths, and recursive scans.
- Reuse the existing checked provider-draft flow: a candidate must still pass
  the non-generation model-catalog check before the explicit Add action imports
  it. The later settings task owns new grouping, permission prompts, and copy.
- Candidate IDs bind the Agent, exact source descriptor, provider identity,
  protocol, and sanitized endpoint metadata. Import re-discovers the candidate
  and re-reads the secret; stale or changed sources fail closed.
- Environment-backed candidates may expose only an allowlisted variable name,
  never its value. Literal config candidates expose a static field label only.
- Current provider persistence and existing Codex/Claude candidate behavior
  remain compatible, including rollback of a stored key when provider config
  persistence fails.

## Tier A Scope

| Agent | Importable API-key shape | Non-importable shape |
| --- | --- | --- |
| Claude Code | `settings.json` `env.ANTHROPIC_API_KEY` or reviewed environment fallback | `ANTHROPIC_AUTH_TOKEN`, `apiKeyHelper`, OAuth/session state |
| Codex | top-level `auth.json.OPENAI_API_KEY`; reviewed `config.toml` `env_key` | `tokens.*`, bearer/session auth, helpers |
| OpenCode | `auth.json` entries with `type: "api"` | `type: "oauth"`, `OPENCODE_AUTH_CONTENT` payload copying |
| Pi Agent | `auth.json` entries with `type: "api_key"`; reviewed model env references | `type: "oauth"`, helper syntax |
| OMP | reviewed `auth.json`/YAML API-key entries and env references | OAuth rows; SQLite secret payload columns |
| Gemini CLI | `GEMINI_API_KEY` or `GOOGLE_API_KEY` environment sources | `oauth_creds.json`, keychain/session material |
| Qwen Code | literal `settings.security.auth.apiKey` or reviewed env reference | `oauth_creds.json` |
| Kimi Code CLI | reviewed provider API-key fields in TOML/legacy JSON | OAuth/session credential directories |
| Mistral Vibe | config-declared `api_key_env_var` and allowlisted `.env` key | keyring/session material, arbitrary dotenv expansion |

Provider mapping is closed and evidence-backed. Unknown provider IDs remain
visible as unsupported metadata or are omitted from provider candidates; they
must not be coerced into `openai-compatible` without a reviewed endpoint and
wire protocol.

## Acceptance Criteria

- [ ] All nine Tier A Agents have fixture-backed exact schema adapters.
- [ ] Every additional enabled adapter cites evidence and has positive, absent,
  malformed, secret-redaction, symlink, and unknown-schema tests.
- [ ] API keys import only after confirmation and a native re-read.
- [ ] OAuth/session/helper sources cannot enter the Cutout API-key proxy.
- [ ] Unsupported Agents remain visible through inventory without parse errors.
- [ ] Codex `auth.json.OPENAI_API_KEY` compatibility is restored and OAuth-only
  Codex auth remains non-importable.
- [ ] Candidate IPC rejects unknown fields and serialized output contains no
  fixture secret, token fragment, absolute path, or helper command.
- [ ] Existing provider discovery, connection-check, persistence, and rollback
  tests remain green.

## Dependency

Starts after the common inventory registry is stable. Session delegation is a
separate child and must not be simulated by importing a token.

## Out of Scope

- Executing Codex, Claude, Pi/OMP, ACP, RPC, helper, login, or version commands.
- Reusing subscription/OAuth quota; that belongs to the session-delegation child.
- UI grouping, localization, or OS permission prompts; those belong to the
  Agent-source settings child.
- Reading OMP SQLite credential payload columns or arbitrary `.env` variables.
