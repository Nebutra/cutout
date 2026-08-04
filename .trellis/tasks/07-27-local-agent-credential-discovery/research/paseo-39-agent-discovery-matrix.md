# Paseo 39-Agent discovery matrix

Retrieved and reviewed on 2026-07-27. `Y` means supported by reviewed public
source, `D` means presence/metadata detection only, and `RN` means
research-needed with no path/schema claim. Import always means a literal API key
after explicit confirmation; OAuth/session material is never imported.

| Paseo Agent | Fixed local entry | Reviewed credential root/files | Detect | Import | Delegate |
| --- | --- | --- | --- | --- | --- |
| Claude Code | `claude`, headless `claude -p` | `CLAUDE_CONFIG_DIR` or `~/.claude`; `settings.json`; `.credentials.json`; macOS Keychain may own login | Y | API key only | Y |
| Codex | `codex app-server` | `CODEX_HOME` or `~/.codex`; `config.toml`; `auth.json`; legacy `~/.config/codex/auth.json` | Y | API key only | Y |
| OpenCode | `opencode serve`; official ACP in current CLI | `$XDG_CONFIG_HOME/opencode`; `$XDG_DATA_HOME/opencode/auth.json` | Y | `type: api` only | Y |
| GitHub Copilot | `copilot --acp` | GitHub CLI auth may use `~/.config/gh/hosts.yml`; Copilot-owned token schema RN | D | No | Y |
| OMP | `omp --mode rpc` / `rpc-ui` | `PI_CONFIG_DIR` or `~/.omp`; profile `agent/auth.json`, `settings.json`, `models.json`; `PI_CODING_AGENT_DIR` | Y | API-key entries only | Y |
| Pi Agent | `pi --mode rpc` / `rpc-ui` | `PI_CODING_AGENT_DIR` or `~/.pi/agent`; `auth.json`, `settings.json`, `models.json` | Y | API-key entries only | Y |
| Cursor | `cursor-agent acp` | Cursor CLI state schema RN | D | Approved env only | Y |
| Gemini CLI | local `gemini` ACP entry; Paseo catalog uses installer form | `GEMINI_CLI_HOME` or `~/.gemini`; `settings.json`, `oauth_creds.json`; keychain may own API key | Y | Env API key only | Y |
| Hermes Agent | `hermes acp` | RN | D | No | Y |
| Qwen Code | local `qwen` ACP entry; Paseo catalog uses installer form | `QWEN_HOME` or `~/.qwen`; `settings.json`, `oauth_creds.json` | Y | Literal API key only | Y |
| Kimi Code CLI | `kimi acp` | `~/.kimi`; `config.toml`; legacy `config.json`; `credentials/` | Y | Literal provider API key only | Y |
| Amp | `amp-acp` third-party wrapper | RN | D | No | Y, wrapper labeled |
| Auggie CLI | local `auggie` ACP entry; Paseo catalog uses installer form | RN | D | No | Y |
| Cline | local `cline` ACP entry; Paseo catalog uses installer form | RN | D | No | Y |
| Codebuddy Code | `codebuddy --acp` | RN | D | No | Y |
| Cortex Code | `cortex acp serve` | RN | D | No | Y |
| Corust Agent | `corust-agent-acp` | RN | D | No | Y |
| crow-cli | `crow-cli acp` | RN | D | No | Y |
| DeepAgents | local DeepAgents ACP package; Paseo catalog uses installer form | RN | D | No | Y |
| CodeWhale | `codewhale serve --acp` | RN | D | No | Y |
| DimCode | local `dimcode` ACP entry; Paseo catalog uses installer form | RN | D | No | Y |
| Dirac | local `dirac` ACP entry; Paseo catalog uses installer form | RN | D | No | Y |
| Factory Droid | local `droid` ACP daemon; Paseo catalog uses installer form | RN | D | No | Y |
| fast-agent | local `fast-agent-acp`; Paseo catalog uses `uvx` installer form | RN | D | No | Y |
| GLM Agent | local `glm-acp-agent`; Paseo catalog uses installer form | RN | D | No | Y |
| goose | `goose acp` | RN | D | No | Y |
| Junie | `junie --acp true` | RN | D | No | Y |
| Kilo Code | `kilo acp` | RN | D | No | Y |
| Minion Code | local `minion-code`; Paseo catalog uses `uvx` installer form | RN | D | No | Y |
| Mistral Vibe | `vibe-acp` | `VIBE_HOME` or `~/.vibe`; `config.toml`; `.env`; keyring may own key | Y | Literal `.env` key only | Y |
| Nova | local Nova ACP package; Paseo catalog uses installer form | RN | D | No | Y |
| Poolside | `pool acp` | RN | D | No | Y |
| Qoder CLI | local `qoder` ACP entry; Paseo catalog uses installer form | RN | D | No | Y |
| siGit Code | `sigit` | RN | D | No | Y |
| Stakpak | `stakpak acp` | RN | D | No | Y |
| VT Code | `vtcode acp` | RN | D | No | Y |
| Agoragentic | local ACP package; Paseo catalog uses installer form | RN; wallet/payment material must not be treated as provider key | D | No | Y, payment policy required |
| Autohand Code | local Autohand ACP package; Paseo catalog uses installer form | RN | D | No | Y |
| Grok | `grok agent stdio` | RN | D | No | Y |

## Reviewed schema notes

- Claude: literal `env.ANTHROPIC_API_KEY` is importable;
  `ANTHROPIC_AUTH_TOKEN` and `claudeAiOauth` are session material.
- Codex: top-level `OPENAI_API_KEY` is importable; OAuth lives under
  `tokens.{access_token,refresh_token,id_token,account_id}` and is not copied.
- OpenCode: provider entries discriminate `{type: "api", key}` from
  `{type: "oauth", refresh, access, expires, ...}`. Reviewed overrides include
  `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, and `OPENCODE_AUTH_CONTENT`.
- Pi/OMP: provider entries discriminate `api_key` from `oauth`; reviewed roots
  include `PI_CONFIG_DIR`, `PI_CODING_AGENT_DIR`, `OMP_PROFILE`, and
  `PI_PROFILE`.
- Gemini: reviewed API-key env names are `GEMINI_API_KEY` and `GOOGLE_API_KEY`;
  Google OAuth and keychain values are not copied.
- Qwen: reviewed literal API key is under `settings.security.auth.apiKey` or a
  configured model env reference; OAuth stays in `oauth_creds.json`.
- Kimi: provider API keys are in `config.toml`/legacy `config.json`; reviewed
  env includes `KIMI_API_KEY` and provider-specific env references.
- Mistral Vibe: provider config names an `api_key_env_var`; `.env` commonly
  contains `MISTRAL_API_KEY`. OAuth/keyring values are not copied.

## Tiers

- Tier A, reviewed credential adapters: Claude Code, Codex, OpenCode, Pi, OMP,
  Gemini CLI, Qwen Code, Kimi Code, and Mistral Vibe.
- Tier B, session-owning CLI adapters: GitHub Copilot and Cursor first, then
  other entries with a verified official ACP/RPC contract.
- Tier C, registry/research-needed: every remaining Agent is included for local
  binary detection and UI display, but credential roots/files remain unset
  until a version-pinned official review lands.

Discovery checks exact binary identities and only reviewed fixed config roots.
It never recursively scans home, guesses dot-directories, invokes `npx -y` or
`uvx`, imports OAuth/session bytes, or executes config helpers.
