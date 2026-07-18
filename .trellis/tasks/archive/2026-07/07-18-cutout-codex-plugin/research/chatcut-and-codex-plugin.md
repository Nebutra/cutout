# ChatCut and Codex Plugin Research

## Sources

- ChatCut plugin landing page: <https://chatcut.io/chatgpt-plugin>
- ChatCut agent-executable install guide: <https://chatcut.io/chatgpt>
- ChatCut public plugin repository:
  <https://github.com/ChatCut-Inc/agent-plugin>
- Current Codex manual plugin guidance fetched through the official manual
  helper on 2026-07-18.
- Local Cutout capability contract: `cutout.agent-capabilities.json`
- Local Cutout control docs: `docs/HEADLESS_AGENT_CONTROL.md`

## What ChatCut Actually Ships

ChatCut's marketing page presents prompt-driven video editing inside Codex or
ChatGPT, but the implementation boundary is visible in its public repository:

1. `.codex-plugin/plugin.json` provides install metadata and points at skills
   and MCP configuration.
2. `.mcp.json` connects to a hosted OAuth HTTP endpoint at
   `https://api.chatcut.io/api/external-mcp/mcp`.
3. Workflow skills teach the agent how to import assets, edit a timeline,
   generate media, export, and verify editor-visible results.
4. A Git marketplace distributes the plugin package.
5. Installation is not complete until authentication succeeds and a new Codex
   conversation loads the newly installed MCP tools.

The important product pattern is "agent intent -> real editable workspace ->
verified result", not copying ChatCut's video-specific claims or its install
prompt verbatim.

## Cutout's Current Boundary

Cutout already has the right control semantics:

- Codex is an explicit external controller.
- `.cutout` Design IR and provenance remain authoritative.
- CLI and stdio MCP expose discovery, capability status, skills, outcome
  submission, preview, approved apply, run observation, and deliverable reads.
- The project root is fixed by `CUTOUT_PROJECT_ROOT`; callers cannot replace it.

The distribution gap is technical, not conceptual. `scripts/cutout-mcp.mjs`
loads the TypeScript runtime through Vite SSR and reads capability/skill files
from the source checkout. A Codex marketplace install caches only the plugin
package, so a portable plugin cannot point back to an adjacent checkout or a
developer-specific absolute path.

## Codex Plugin Contract

- Required entry point: `.codex-plugin/plugin.json`.
- Optional components live at plugin root: `skills/`, `.mcp.json`, hooks,
  assets, and app wiring.
- A repo marketplace lives at `.agents/plugins/marketplace.json`; a personal
  marketplace lives at `~/.agents/plugins/marketplace.json`.
- Installed plugins load from Codex's cache and new skills/MCP tools require a
  new session.
- Plugin-provided MCP servers can be stdio commands or remote HTTP endpoints.

## Design Consequences

- A manifest-only wrapper does not make Cutout one-click usable.
- A hardcoded path to this checkout would pass only on one machine and is not a
  product adapter.
- Filesystem search for a Cutout checkout would weaken the declared path and
  host-binding model.
- The robust local analogue to ChatCut's hosted MCP is a self-contained Cutout
  MCP distribution whose server code is independent of the source checkout,
  while still binding each process to an explicit project root.
- Until that distribution exists, a repo-local plugin can still package skills
  and marketplace metadata, but MCP setup remains a separate prerequisite.

## External Architecture Review

The Bailian review correctly highlighted distribution coupling,
manifest/implementation drift, and approval semantics as primary risks. Its
proposal to remove apply operations was rejected because Cutout already owns a
versioned preview/approval/apply contract; the plugin should preserve that
contract rather than invent a reduced tool protocol. Its suggestion that
`plugin.json` declare individual MCP tools was also rejected because Codex
discovers tools from `.mcp.json` and the MCP server, not from a manifest tool
list.
