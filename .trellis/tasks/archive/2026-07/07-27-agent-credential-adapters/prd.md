# Reviewed Agent credential adapters

## Goal

Add exact-path, typed credential-source adapters for common Agents so Cutout can
show sanitized availability and explicitly import supported API keys without
copying OAuth/session tokens or executing helpers.

## Background

- The common inventory registry pins all 39 Paseo Agents.
- The latest remote baseline contains commit `bf03bfe`, including Codex
  `auth.json.OPENAI_API_KEY` compatibility that must remain intact.
- `provider_discovery.rs` owns sanitized candidates, checked transient drafts,
  native secret resolution, connection checks, and atomic provider/key writes.
- The reviewed matrix supports nine Tier A adapters. It does not authorize a
  generic home-directory scan or heuristic import of fields named key/token.

## Requirements

- Initial adapters cover Claude Code, Codex, OpenCode, Pi, OMP, Gemini CLI,
  Qwen Code, Kimi Code CLI, and Mistral Vibe.
- Each adapter owns reviewed roots, exact files, schema discriminator, closed
  provider/protocol mapping, sanitized metadata, and a native secret selector.
- Discovery returns no secret value, token fragment, helper text, absolute
  host path, JSON pointer, or arbitrary config field across IPC.
- Candidate IDs bind Agent/source identity and provider metadata without using
  secret bytes. Check and import re-discover the candidate and re-read natively.
- API-key import uses the existing explicit checked-draft/Add flow. Frontend
  callers never supply Agent-source secret bytes or filesystem paths.
- OAuth, bearer, subscription, helper, keyring, and unknown entries are
  display-only or unsupported and cannot enter Cutout's API-key proxy.
- Readers reject symlink roots/components/files, non-files, oversized input,
  unknown schemas, helper syntax, arbitrary paths, and recursive scans.
- Environment-backed sources expose only a strict allowlisted variable name.
  Literal sources expose only static source/field labels.
- Unknown provider IDs are not coerced into OpenAI-compatible. Custom providers
  require an explicit reviewed base URL and supported wire protocol.
- Preserve current provider candidate IDs and Codex/Claude behavior where
  practical, including key rollback if provider persistence fails.
- Update the common inventory capability flag to supported only for adapters
  that pass the complete fixture and import test contract.

## Tier A Scope

| Agent | Importable API-key shape | Non-importable shape |
| --- | --- | --- |
| Claude | `settings.json` `env.ANTHROPIC_API_KEY` or reviewed environment fallback | bearer token, OAuth credentials, `apiKeyHelper` |
| Codex | top-level `auth.json.OPENAI_API_KEY`; reviewed `config.toml` `env_key` | `tokens.*`, bearer/session/helper fields |
| OpenCode | provider entry with `type: "api"` and known binding | `type: "oauth"`, unknown provider/schema |
| Pi | provider entry with `type: "api_key"`; reviewed model env reference | `type: "oauth"`, unsupported API/helper |
| OMP | Pi-compatible JSON or reviewed YAML literal/env key | OAuth; SQLite payload column; YAML tags/aliases |
| Gemini | `GEMINI_API_KEY` or `GOOGLE_API_KEY` environment | OAuth file, ADC/keychain/session material |
| Qwen | literal `settings.security.auth.apiKey` or reviewed env reference | OAuth file |
| Kimi | reviewed TOML or legacy JSON provider API-key field | credentials directory or OAuth/session data |
| Vibe | config-declared env key, with exact `.env` fallback | keyring/session material or dotenv expansion |

## Acceptance Criteria

- [x] All nine Tier A Agents have fixture-backed exact schema adapters.
- [x] Every adapter has positive, absent, malformed, secret-redaction,
  symlink, oversized, and unknown-schema tests.
- [x] API keys import only after a checked candidate and native re-read.
- [x] Source secret or provider binding changes invalidate the candidate/draft.
- [x] OAuth/session/helper sources cannot enter the Cutout API-key proxy.
- [x] Codex `auth.json.OPENAI_API_KEY` and existing Claude compatibility remain.
- [x] Unsupported Agents remain visible through inventory without parse errors.
- [x] Candidate IPC rejects unknown or secret-bearing fields.
- [x] Existing provider discovery, check, persistence, and rollback tests pass.

## Out of Scope

- Executing any Agent, ACP/RPC process, helper, login, or version command.
- Reusing subscription/OAuth quota; that is the session-delegation child.
- Settings grouping, localization, and OS permission prompts.
- Reading OMP SQLite secret payloads or arbitrary dotenv variables.
