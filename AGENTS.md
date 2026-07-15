# Repository Agent Contract

Read `cutout.agent-capabilities.json` before changing or invoking Cutout's Agent
surface. Validate contract changes with `pnpm agent:validate`.

- `.cutout` Design IR and provenance are authoritative; exports are generated.
- Preview ingestion and exports before any approved apply.
- Never invent approvals, weaken policy, expose secrets or add arbitrary paths.
- Do not represent live Figma sync, web fetching/search, video processing,
  cloud collaboration or a headless provider as implemented.
- Keep CLI, MCP, protocol, manifest and docs synchronized in one change.
