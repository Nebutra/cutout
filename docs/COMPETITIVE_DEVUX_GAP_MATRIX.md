# Competitive DevUX Gap Matrix

Status: official-source research baseline, 2026-07-12.

This document compares developer and Agent-facing product surfaces. It does not
declare a competitor capability implemented in Cutout. Product claims below
are limited to first-party pages linked in Sources.

## Product thesis

Cutout should combine three properties without collapsing their boundaries:

1. An outcome-first Design OS for humans.
2. A repo-native control plane that external coding Agents can discover and
   operate through Skills, MCP, CLI, schemas, previews, approvals, and receipts.
3. Product integrations implemented through each vendor's official API, SDK,
   plugin, or file surface.

The target is not another component gallery. It is a verified delivery graph:

```text
Need + evidence
  -> Design IR
  -> Design/Brand Kit
  -> component and template contracts
  -> registry/package plans
  -> coding-agent apply
  -> build, interaction, a11y and visual checks
  -> provenance-bearing delivery receipt
```

## Official practice summary

| Product | Officially evidenced DevUX | Durable lesson for Cutout |
| --- | --- | --- |
| shadcn/ui | Its registry specification distributes components, styles, CSS variables and other files; its CLI initializes projects, adds source into the consumer project, resolves dependencies and builds registries. Its MCP server lets coding Agents browse, search and install from public, private and namespaced registries. | Treat source ownership, dependency resolution, dry-run/diff and a universal registry item as one product contract. MCP should call the same registry/installer engine as CLI rather than implement a second path. |
| 21st.dev | The official marketplace exposes crafted React components and templates. Its MCP/CLI surface advertises semantic search over components/themes/templates, installation into the current project, variants, lists/private team libraries, and publishing/managing components, themes and templates. | Discovery quality and curation metadata are part of delivery. An Agent needs real references before generating, and installed source needs a stable origin/version receipt. Marketplace claims require trust, moderation and licensing, not only search. |
| Astryx | Astryx describes itself as open source, customizable and Agent-ready; its official site exposes 160+ accessible/themeable React components, themes, templates and CLI/MCP workflows for scaffolding, browsing, theme generation and Agent-ready docs. | A Design System Kit must be directly consumable: tokens + components + templates + docs + theme tooling. “Agent-ready” means machine-readable usage guidance and consistent install/scaffold paths, not just an LLM prompt. |
| Figma Dev Mode / Code Connect | Code Connect maps design-system components to repository code and publishes true production snippets into Dev Mode. Template files map Figma properties/variants to code; CLI/CI and framework-specific integrations are documented. Figma states these connections also improve its MCP server's implementation context. | Stable design node/component identity, property mapping, repository source location and publish verification must travel together. A screenshot or generated snippet is not a binding receipt. |
| Figma Plugins | The Plugin API can read and write nodes in a user-open file, but plugins are user-invoked, short-lived and cannot run as background services. Dev Mode has distinct plugin behavior. | Node-level apply belongs in a user-installed Figma plugin with preview and receipts. Cutout REST/snapshot adapters must not claim arbitrary remote canvas writes or live background sync. |
| Framer Plugins / Code Components | Plugins extend editor workflows and can work with components; Code Components are React components that render on the canvas/preview/published site. Framer documents component sharing and distributes templates, components and plugins through its marketplace. | Framer delivery requires a purpose-built plugin/server adapter and Framer-compatible component metadata, controls and preview. A generic React export is not automatically a Framer Code Component or publish receipt. |

## Cutout current-state mapping

| Surface | Current authoritative implementation | What it proves | Important limit |
| --- | --- | --- | --- |
| External Agent discovery | `cutout.agent-capabilities.json`, `skills/index.json`, per-skill `SKILL.md`, `agents/openai.yaml`, CLI/MCP handshake and capability tools | Codex/Claude can discover Cutout's bounded operations without being embedded in Cutout. | Product skills describe Cutout operations; there is not yet a searchable component/template registry protocol. |
| MCP and CLI | Versioned control protocol, 17 operations, stdio MCP, dry-run/apply, revision guards, approvals and managed exports | One controlled path can preview and execute project operations. | Component browse/search/install/publish commands and registry namespaces are absent. |
| Design Kit | Deterministic `DESIGN.md`, token JSON, CSS Variables, Tailwind v4, typed theme, Figma payload and Astryx binding plan | Outputs share a Design IR/token graph and can be hash/provenance verified. | Astryx output is a binding plan, not proof that an Astryx package was installed, built and visually verified. |
| Component Candidate | Explicit component evidence with props, variants, slots and token references | Cutout avoids unsupported screenshot-to-JSX certainty. | Metadata lacks a complete distributable registry item, ownership/license policy, compatibility matrix, examples and consumer receipts. |
| Starter | Deterministic Next App Router and Vite React plans plus coding-delivery contracts | Stable scaffolding can precede project-specific coding work. | No general template registry, dependency solver, upgrade policy, ejection/ownership receipt or multi-framework compatibility evidence. |
| Coding delivery | Controlled staging, bounded coding task, validation and atomic promotion contracts | Project-specific work can be separated from deterministic compilation. | A fully installed external coding-host E2E remains a release gate; Cutout must not claim a bundled coding Agent. |
| Figma integration | Authorized snapshot import, Variables/component/Code Connect hints, binding export | Offline structured interchange preserves stable IDs and provenance. | No node-level plugin apply, Dev Mode publish, Code Connect CLI/CI receipt or live sync. |
| Integration SDK | Versioned manifests, host-owned secret handles, preview/apply/publish plans, conflict/revision guards and receipts | Vendor adapters can remain separate from the external-Agent control plane. | Framer is still `adapter-required`; Figma node writes require a future plugin host. |
| Quality | Type/schema tests, accessibility/interaction intent, browser/visual gates and package-consumer goals | Delivery can be promoted only after evidence. | A single cross-artifact delivery receipt does not yet bind design revision, registry item, installed files, build result, screenshots and external publish IDs. |

## Gap matrix

| Capability | Best-practice bar | Cutout status | Gap | Priority |
| --- | --- | --- | --- | --- |
| Universal item schema | One versioned item covers files, dependencies, tokens/CSS, docs, examples, metadata and compatibility. | Component candidates and Starter plans are separate contracts. | Define `cutout.registry-item.v1` and deterministic projection from verified Design IR. | P0 |
| Open-code ownership | Consumer sees exact file writes, conflicts and dependency changes before source lands in its repo. | Coding tasks and managed exports have preview/apply boundaries. | Add item install plan, file diff, overwrite policy, target framework resolution and installed-origin ledger. | P0 |
| Component metadata | Searchable anatomy, props, variants, slots, states, tokens, a11y, examples, framework and license. | Candidate contracts cover core structure and tokens. | Add examples/stories, quality level, framework versions, provenance/license, visual references, deprecation/replacement and source ownership. | P0 |
| Search and discovery | Agents query capabilities and curated items semantically and by exact filters before generation. | Skills/capabilities are discoverable; material/project listing exists. | Add local registry list/get/search endpoints with deterministic filters first; semantic ranking can be an optional provider-backed layer. | P0 |
| CLI/MCP parity | MCP delegates to the same resolver/installer/publisher as CLI with identical plans and receipts. | Cutout control plane already shares protocol concepts. | Add registry operations once, expose them through CLI/MCP, and validate manifest/docs/tool drift. | P0 |
| Install receipt | Receipt binds item/version, resolved dependencies, file hashes, target, base revision, tests and resulting commit/patch. | Export and coding receipts exist in separate stages. | Create a composite delivery receipt and artifact-index relation; never infer success from generated files alone. | P0 |
| Design-to-code receipt | Stable design component/node ID maps to code symbol/source and verified property mapping. | Figma snapshot and binding manifest preserve IDs. | Add Code Connect template generation/validation, CLI dry-run/publish plan and CI receipt; do not call this node sync. | P0 |
| Package/template distribution | Components, themes and templates can be versioned, namespaced, authenticated and consumed reproducibly. | Starter export and Astryx plan exist. | Add local/private registry build, namespace and content-addressed immutable item output before any public marketplace. | P1 |
| Upgrade/ejection policy | Owned source can be updated with a three-way diff while respecting consumer edits. | No registry installer ledger. | Track installed base hashes and surface manual conflict plans; default to preserve-local rather than overwrite. | P1 |
| Curation/trust | Search results expose author, license, quality evidence, compatibility, moderation and provenance. | Source provenance/license is foundational in Design IR. | Extend it to registry items and ranking; block publication when license or quality evidence is missing. | P1 |
| Agent guidance | Item-specific usage and constraints are progressively disclosed, not dumped into every prompt. | 15 product Skills use index -> SKILL -> references. | Generate an item-level Agent usage fragment from component metadata; keep product Skills and item knowledge distinct. | P1 |
| Figma node apply | User-invoked plugin previews a node patch and returns stable IDs, conflicts and apply receipt. | Adapter only supports snapshot/binding interchange. | Build a Figma Plugin bridge; respect short-lived, foreground execution and Dev Mode limits. | P1 |
| Framer delivery | Framer plugin/code component mapping with property controls, canvas preview and publish boundary. | Manifest is `adapter-required`. | Implement official Framer plugin adapter and separate staged publish; do not label generic React as Framer-ready. | P1 |

## P0 implementation plan

### 1. Registry IR and compiler

Define `cutout.registry.v1` and `cutout.registry-item.v1`. An item should contain:

- stable ID, namespace, semantic version and content hash;
- kind: primitive, component, block, pattern, template, theme or starter;
- framework/runtime compatibility and peer dependencies;
- owned source files with target-safe relative paths;
- token/CSS requirements and Design IR entity references;
- component anatomy, props, variants, slots, states and a11y contract;
- stories/examples and desktop/mobile visual evidence;
- author, source provenance, license and promotion status;
- deprecation/replacement data;
- generated Agent usage fragment;
- required quality gates.

Compiler output must be deterministic. A registry item is a projection of
verified Design IR and delivery evidence, never a second source of truth.

### 2. Resolver and open-code installer

Implement one engine used by desktop, CLI and MCP:

```text
registry.resolve
  -> compatibility and dependency plan
  -> target-safe file diff
  -> conflict and license report
  -> explicit approval
  -> staged write
  -> typecheck/test/build/visual/a11y gates
  -> atomic promotion
  -> composite receipt
```

The installed-origin ledger must retain base hashes so future updates can
produce a three-way conflict plan without overwriting consumer edits.

### 3. Discovery operations

Add exact, provider-free operations first:

- `registry.list`
- `registry.get`
- `registry.search`
- `registry.install`
- `registry.receipt`

Filters should include kind, framework, dependency, token, accessibility,
license, author and promotion status. Optional semantic search may rank these
results, but must return the same stable item IDs and evidence.

Expose identical operations through CLI and MCP. Extend capability, schema,
Skill and docs validators in the same change.

### 4. Unified delivery receipt

Create a receipt that binds:

- need/outcome and Design IR revisions;
- Design/Brand Kit manifests;
- registry item/version/hash;
- target repository and base revision;
- resolved dependencies and exact file hashes;
- coding task/promotion receipt;
- test/build/a11y/visual evidence;
- optional Figma/Framer publication receipt.

This is the missing trust object between “generated” and “delivered”.

### 5. Figma Code Connect delivery

Add a bounded Code Connect path before node mutation:

1. map verified Figma component/property IDs to code symbols;
2. generate reviewable template files;
3. validate via the official Code Connect CLI in a controlled host;
4. preview publish scope;
5. publish only with approval;
6. store CLI/CI output and remote identity in a receipt.

## P1 implementation plan

1. Build content-addressed local/private registry bundles with namespaces and
   host-owned authentication handles.
2. Add curated collections, trust metadata and organization policy without
   coupling the core registry to a public marketplace.
3. Generate item-level Agent usage fragments and consumer examples from the
   same metadata graph.
4. Implement a user-invoked Figma Plugin for previewed node apply and receipt
   readback; keep REST snapshot/event support separate.
5. Implement a Framer adapter for explicit Code Component/property-control
   mapping and staged plugin publish.
6. Add package/template release channels only after install/update/rollback and
   license gates are proven with consumer fixtures.

## Decisions to preserve

- External coding Agents operate Cutout; they are not bundled integrations.
- Figma and Framer remain product integrations through official surfaces.
- Design IR and provenance remain authoritative; registry/package outputs are
  generated projections.
- Preview precedes apply. External publication requires explicit approval.
- Credentials stay host-owned opaque handles.
- Screenshot similarity alone never proves component identity or code binding.
- “Available” requires a real executor and receipt, not a manifest placeholder.

## Official sources

- shadcn/ui: [Registry](https://ui.shadcn.com/docs/registry), [CLI](https://ui.shadcn.com/docs/cli), [MCP Server](https://ui.shadcn.com/docs/mcp), [registry item schema](https://ui.shadcn.com/docs/registry/registry-item-json)
- 21st.dev: [official marketplace](https://21st.dev/), [MCP and CLI](https://21st.dev/mcp)
- Astryx: [official site](https://astryx.atmeta.com/), [CLI](https://astryx.atmeta.com/docs/cli), [getting started](https://astryx.atmeta.com/docs/getting-started), [components](https://astryx.atmeta.com/components), [templates](https://astryx.atmeta.com/templates)
- Figma: [Code Connect](https://developers.figma.com/docs/code-connect/), [template files](https://developers.figma.com/docs/code-connect/template-files/), [CLI reference](https://developers.figma.com/docs/code-connect/cli-reference/), [Plugins](https://developers.figma.com/docs/plugins/), [working in Dev Mode](https://developers.figma.com/docs/plugins/working-in-dev-mode/)
- Framer: [Plugins introduction](https://www.framer.com/developers/plugins-introduction), [Code Components introduction](https://www.framer.com/developers/components-introduction), [component sharing](https://www.framer.com/developers/component-sharing), [marketplace](https://www.framer.com/community/marketplace/)
