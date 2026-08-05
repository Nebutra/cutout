# Discover and authorize local Agent credentials

## Goal

Help users discover supported local coding Agent installations and their usable
credential or authenticated-session sources, show only sanitized metadata, and
require explicit authorization before Cutout imports an API key or delegates
work to an Agent's existing login session.

The first release should inventory every coding Agent currently listed at
`https://paseo.sh/agents` through an extensible reviewed-tool registry. The
catalog is a pinned, offline product asset rather than a runtime dependency on
Paseo. It must not recursively crawl the user's home directory or infer support
from arbitrary dot-directories.

## Background

- Cutout v0.1.9 already discovers API-key-compatible material from exact Codex
  and Claude Code files in
  `src-tauri/src/commands/ai/provider_discovery.rs:233` and
  `src-tauri/src/commands/ai/provider_discovery.rs:312`.
- The current implementation does not discover Pi or OMP and does not detect or
  use authenticated CLI sessions.
- API keys can be copied into Cutout's owner-only local credential store after
  confirmation. OAuth and subscription sessions are not API keys and must stay
  owned by the original tool runtime.
- The current capability contract states that no provider executor is bundled
  in `cutout.agent-capabilities.json`; any delegated-session implementation must
  update the contract and synchronized documentation truthfully.
- Local schema research found these initial reviewed locations:
  - Codex: `$CODEX_HOME` or `~/.codex`, exact `auth.json` and `config.toml`.
  - Claude Code: `~/.claude`, exact `settings.json`.
  - Pi: `~/.pi/agent`, exact `auth.json`, `models.json`, and `settings.json`.
  - OMP: `~/.omp/agent`, exact `agent.db`, `models.yml` or `models.yaml`, and
    `config.yml`; reviewed environment/profile overrides may select a different
    root without allowing arbitrary caller-supplied paths.
- On 2026-07-27, Paseo listed 39 Agents. All 39 are in Cutout's initial
  inventory scope: Claude Code, Codex, OpenCode, GitHub Copilot, OMP, Pi Agent,
  Cursor, Gemini CLI, Hermes Agent, Qwen Code, Kimi Code CLI, Amp, Auggie CLI,
  Cline, Codebuddy Code, Cortex Code, Corust Agent, crow-cli, DeepAgents,
  CodeWhale, DimCode, Dirac, Factory Droid, fast-agent, GLM Agent, goose, Junie,
  Kilo Code, Minion Code, Mistral Vibe, Nova, Poolside, Qoder CLI, siGit Code,
  Stakpak, VT Code, Agoragentic, Autohand Code, and Grok.
- Paseo's catalog supplies useful CLI/ACP identities, but it does not establish
  that a credential schema is safe to read. Cutout must maintain its own
  evidence-backed credential adapters.
- Current evidence supports initial exact-file credential adapters for nine
  Agents: Claude Code, Codex, OpenCode, Pi, OMP, Gemini CLI, Qwen Code, Kimi
  Code CLI, and Mistral Vibe. GitHub Copilot and Cursor are initial
  session-delegation candidates without credential copying. The remaining
  catalog entries stay visible as `research-needed` until reviewed.

## Requirements

### R1. Closed discovery registry

- Define one native registry entry for each of the 39 pinned Paseo Agents with
  stable ID, display name, CLI identities, locally detectable launch forms,
  catalog provenance, and last-reviewed metadata.
- Each entry with credential discovery support must also define reviewed root
  resolution, exact relative files, supported schema versions, CLI identities,
  and supported credential/session capabilities.
- Every catalog entry must report installation state even when its credential
  schema is not yet supported. Unsupported credential parsing is a visible,
  non-error capability state, not a reason to omit the Agent.
- Resolve only registered roots and exact files. Do not recursively scan home,
  shell history, session logs, paste caches, project trees, or unrelated hidden
  directories.
- Root overrides must come only from reviewed tool-owned environment variables
  such as `CODEX_HOME`, `PI_CONFIG_DIR`, `PI_CODING_AGENT_DIR`, `OMP_PROFILE`,
  or `PI_PROFILE`. Frontend callers cannot submit arbitrary filesystem paths.
- Readers must accept regular files only, reject symlinks, enforce size/time
  bounds, tolerate missing files, and fail closed on unknown schemas.
- Discovery must not invoke `npx -y`, `uvx`, package installers, login commands,
  or any executable form that may download or mutate software. It may inspect
  local executable/package presence through bounded read-only probes.

### R2. Sanitized inventory

- Discovery returns only tool name, provider name, source kind, sanitized
  location label, credential/session type, availability, authorization state,
  importability/delegatability, CLI presence/version status, and warnings.
- No API key, OAuth token, session token, helper output, database payload, token
  fragment, or credential-shaped unknown field may cross native IPC.
- OMP `agent.db` discovery may query only reviewed metadata columns such as
  `provider`, `credential_type`, and `disabled_cause`; it must never select the
  `data` column for inventory.
- Unknown or unsupported entries remain visible only as an unsupported source
  count/status when that can be reported without exposing secret material.

### R3. API-key import

- Import only reviewed API-key shapes after the user selects the source and
  confirms the import action.
- Supported initial shapes are:
  - Codex top-level `OPENAI_API_KEY` and reviewed `env_key` references.
  - Claude Code `env.ANTHROPIC_API_KEY`.
  - OpenCode `auth.json` entries explicitly discriminated as `api`, plus
    reviewed provider metadata.
  - Pi `auth.json` entries explicitly discriminated as `api_key`, plus reviewed
    environment references from `models.json`.
  - OMP `models.yml|models.yaml` provider API keys that are either reviewed
    environment references or literal API keys.
  - Gemini reviewed API-key environment references; OAuth/keychain values are
    not copied.
  - Qwen literal `settings.security.auth.apiKey` and reviewed environment
    references; OAuth is display-only.
  - Kimi literal provider API keys from reviewed config schema.
  - Mistral Vibe reviewed `.env` API-key values and provider env references.
- Never execute credential helpers, `apiKeyHelper`, `!command`, shell
  expansion, or arbitrary commands while discovering or importing.
- Native code must re-resolve the selected registered source at import time;
  the frontend cannot provide secret bytes.

### R4. Authenticated-session delegation

- OAuth, bearer, subscription, and session credentials are displayable as
  sanitized availability metadata but cannot be copied into Cutout's native
  API-key proxy.
- Reusing any supported Agent allowance must delegate to its installed original
  CLI, official ACP/RPC entry, or official local gateway so that the source tool
  continues to own login, refresh, account selection, and quota behavior.
- Delegation requires an explicit enable/authorize action separate from API-key
  import. Cutout stores only an opaque binding and provenance, never the source
  session token.
- Any delegated executor must use a fixed binary allowlist, shell-free fixed
  argument construction, controlled working directory, bounded input/output,
  timeout and cancellation, output redaction, and an auditable authorization
  receipt.
- A tool without a verified non-interactive interface must remain discovered
  but disabled for delegation; Cutout must not claim subscription support.

### R5. Authorization and permission UX

- Settings shows all discovered supported tools, including sources that need
  permission, are missing a CLI, or contain only a non-importable session.
- API-key import and CLI-session delegation are distinct actions with distinct
  explanations and confirmation dialogs.
- If the OS or Tauri scope blocks a registered root, offer a native permission
  flow for that exact Agent root. The granted root may only be combined with
  registry-owned relative paths; it does not authorize arbitrary browsing.
- Denial or cancellation leaves the source disabled and does not repeatedly
  prompt without a new user action.
- All new user-facing copy must be localized in English, Simplified Chinese,
  Japanese, French, and Spanish.

### R6. Compatibility and contract truth

- Preserve existing Codex and Claude API-key discovery behavior and stored
  provider compatibility.
- Keep CLI, MCP, protocol, manifest, capability contract, and docs synchronized
  if a delegated provider executor becomes implemented or exposed.
- Run `pnpm agent:validate` for any Agent capability contract change.
- Never represent a source as usable until the installed artifact and required
  capability have been verified locally.
- Do not fetch the Paseo catalog at runtime. Updating the pinned catalog is a
  reviewed source change with deterministic tests and source attribution.

## Acceptance Criteria

- [ ] The offline registry contains all 39 Agents listed by Paseo on 2026-07-27
  and tests detect catalog drift, duplicate IDs, missing labels, and invalid CLI
  identities.
- [ ] Discovery reports an installation/capability row for every catalog Agent,
  including a truthful unsupported-credential state when no audited schema is
  available.
- [ ] Every credential-capable row is produced through fixed roots, exact-path
  readers, and an evidence-backed per-Agent schema adapter.
- [ ] Tests prove that home recursion, caller-supplied paths, symlinks,
  oversized files, unknown schemas, helper execution, and secret-shaped IPC
  fields are rejected.
- [ ] Tier A API-key sources for all nine reviewed Agents can be explicitly
  imported without secret bytes crossing frontend IPC.
- [ ] OAuth/subscription sources are visibly distinguished from API keys and
  cannot be imported as API keys.
- [ ] Users can explicitly authorize a verified CLI/session adapter, or see a
  truthful unavailable reason when no safe adapter exists.
- [ ] Permission prompts are scoped to the exact registered Agent root and
  denial does not change provider state.
- [ ] The settings flow remains usable with zero sources, partial sources,
  unavailable CLIs, parse failures, and denied permissions.
- [ ] New UI is complete in `en`, `zh-CN`, `ja`, `fr`, and `es`.
- [ ] Focused Rust, frontend, schema, ACL, security, and packaged-app tests pass.
- [ ] `pnpm agent:validate` passes when the capability contract changes.

## Out of Scope

- Recursive scanning of the entire home directory or arbitrary hidden folders.
- Reading shell history, session transcripts, logs, paste caches, or project
  files to hunt for secrets.
- Copying or replaying private OAuth/session tokens outside their owning tool.
- Executing credential helper commands during discovery.
- Claiming quota balance, entitlement, or subscription compatibility from token
  presence alone.
- Supporting an unreviewed Agent by folder-name similarity.
- Runtime dependence on Paseo availability or silently adding Agents from a
  remote catalog without a Cutout review and release.
