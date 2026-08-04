# Paseo Agent catalog snapshot

## Provenance

- Page: `https://paseo.sh/agents`
- Retrieved: 2026-07-27
- Page statement: Paseo runs the native CLI for 39 coding Agents.
- Source repository: `https://github.com/getpaseo/paseo`
- Inspected commit: `1a1ff8828f002fce08e239bae3d46aff75e22f52`
- Name source: `packages/website/src/data/agent-pages.ts`
- ACP launch source: `packages/app/src/data/acp-provider-catalog.ts`

This snapshot is research evidence, not a runtime remote catalog. Paseo's launch
support does not prove that an Agent credential format is safe for Cutout to
read, import, or reinterpret.

## Page catalog

| Slug | Name |
| --- | --- |
| `claude-code` | Claude Code |
| `codex` | Codex |
| `opencode` | OpenCode |
| `copilot` | GitHub Copilot |
| `omp` | OMP (Oh My Pi) |
| `pi` | Pi Agent |
| `cursor` | Cursor |
| `gemini` | Gemini CLI |
| `hermes` | Hermes Agent |
| `qwen-code` | Qwen Code |
| `kimi` | Kimi Code CLI |
| `amp` | Amp |
| `auggie` | Auggie CLI |
| `cline` | Cline |
| `codebuddy` | Codebuddy Code |
| `cortex-code` | Cortex Code |
| `corust` | Corust Agent |
| `crow` | crow-cli |
| `deepagents` | DeepAgents |
| `deepseek-tui` | CodeWhale |
| `dimcode` | DimCode |
| `dirac` | Dirac |
| `factory-droid` | Factory Droid |
| `fast-agent` | fast-agent |
| `glm` | GLM Agent |
| `goose` | goose |
| `junie` | Junie |
| `kilo` | Kilo Code |
| `minion-code` | Minion Code |
| `mistral-vibe` | Mistral Vibe |
| `nova` | Nova |
| `poolside` | Poolside |
| `qoder` | Qoder CLI |
| `sigit` | siGit Code |
| `stakpak` | Stakpak |
| `vtcode` | VT Code |
| `agoragentic` | Agoragentic |
| `autohand` | Autohand Code |
| `grok` | Grok |

## Paseo ACP catalog observations

The ACP catalog is not identical to the 39 marketing-page entries. It includes
additional providers such as Devin, Kiro, and TRAE, while native built-ins are
defined elsewhere. Its commands are useful evidence for local CLI identities,
but installer forms must never run during Cutout discovery.

| Paseo ID | Local/launch form | Discovery rule |
| --- | --- | --- |
| `agoragentic-acp` | `npx -y agoragentic-mcp@1.3.6 --acp` | Never execute installer form |
| `amp-acp` | `amp-acp` | Probe local binary only |
| `auggie` | `npx -y @augmentcode/auggie@0.33.0 --acp` | Never execute installer form |
| `autohand` | `npx -y @autohandai/autohand-acp@0.2.1` | Never execute installer form |
| `cline` | `npx -y cline@3.0.46 --acp` | Never execute installer form |
| `codebuddy-code` | `codebuddy --acp` | Probe local binary only |
| `codewhale` | `codewhale serve --acp` | Probe local binary only |
| `cortex-code` | `cortex acp serve` | Probe local binary only |
| `corust-agent` | `corust-agent-acp` | Probe local binary only |
| `crow-cli` | `crow-cli acp` | Probe local binary only |
| `cursor` | `cursor-agent acp` | Probe local binary only |
| `deepagents` | `npx -y deepagents-acp@0.1.20` | Never execute installer form |
| `devin` | `devin acp` | Not in the 39-page snapshot |
| `dimcode` | `npx -y dimcode@0.2.36 acp` | Never execute installer form |
| `dirac` | `npx -y dirac-cli@0.4.22 --acp` | Never execute installer form |
| `factory-droid` | `npx -y droid@0.179.0 exec --output-format acp-daemon` | Never execute installer form |
| `fast-agent` | `uvx --from fast-agent-acp==0.9.22 fast-agent-acp -x` | Never execute installer form |
| `gemini` | `npx -y @google/gemini-cli@0.52.0 --acp` | Never execute installer form |
| `glm-acp-agent` | `npx -y glm-acp-agent@1.3.0` | Never execute installer form |
| `goose` | `goose acp` | Probe local binary only |
| `grok` | `grok agent stdio` | Probe local binary only |
| `hermes` | `hermes acp` | Probe local binary only |
| `junie` | `junie --acp true` | Probe local binary only |
| `kilo` | `kilo acp` | Probe local binary only |
| `kiro` | `kiro-cli acp` | Not in the 39-page snapshot |
| `kimi` | `kimi acp` | Probe local binary only |
| `minion-code` | `uvx --from minion-code==0.1.44 minion-code acp` | Never execute installer form |
| `mistral-vibe` | `vibe-acp` | Probe local binary only |
| `nova` | `npx -y @compass-ai/nova@1.1.29 acp` | Never execute installer form |
| `poolside` | `pool acp` | Probe local binary only |
| `qoder` | `npx -y @qoder-ai/qodercli@1.1.4 --acp` | Never execute installer form |
| `qwen-code` | `npx -y @qwen-code/qwen-code@0.20.1 --acp --experimental-skills` | Never execute installer form |
| `sigit` | `sigit` | Probe local binary only |
| `stakpak` | `stakpak acp` | Probe local binary only |
| `traecli` | `traecli acp serve` | Not in the 39-page snapshot |
| `vtcode` | `vtcode acp` | Probe local binary only |

## Cutout implications

- Pin the 39 names/IDs in an offline registry and report an inventory state for
  every entry.
- Maintain separate evidence for executable detection, config roots, credential
  schemas, API-key import, and session delegation.
- Do not treat an ACP command as permission to inspect credentials.
- Do not invoke installer-backed launch forms during discovery.
- Unknown credential schemas remain visible as unsupported instead of triggering
  recursive filesystem scanning or heuristic secret parsing.
