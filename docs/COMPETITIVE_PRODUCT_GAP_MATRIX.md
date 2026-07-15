# Competitive Product Gap Matrix

Research date: 2026-07-12. This is a product and DevUX comparison, not a claim
of API compatibility. Only first-party product pages and developer
documentation are used. A visible product feature is not treated as a public
API unless the vendor documents one.

## Target Position

Cutout's intended position is **Lovart's outcome-driven visual generation plus
Figma's structured, inspectable design system**, with a third property neither
position alone guarantees: external Coding Agents can control Cutout through
standard MCP, CLI, repository Skills and versioned artifacts.

The target loop is:

```text
Need + references
  -> Agent creates and evaluates visual directions
  -> user chooses outcomes, not implementation steps
  -> selected work becomes structured Design IR
  -> tokens, components, motion and provenance remain editable
  -> Agent/Coding Agent validates and publishes approved deliverables
```

## Officially Evidenced Strengths

| Product | Publicly evidenced strength | Public programmable boundary | Do not infer |
| --- | --- | --- | --- |
| Lovart | Conversational AI design agent producing brand and campaign materials, including logos, packaging, social content and video ads | No public general-purpose SDK/API was confirmed from the reviewed official product page | Do not claim canvas nodes, asset-lineage APIs, model routing APIs or third-party automation merely from the product experience |
| LiblibAI | AI creation platform, model-sharing community, online WebUI/ComfyUI workflows and model training | No stable public product-integration API was confirmed from the reviewed official public page | Do not represent community models, training or workflow UI as a supported external SDK contract |
| Framer | Responsive visual web canvas, AI exploration, effects, reusable components and direct publishing | Official Plugin API and Server API; code components are documented developer surfaces | Do not assume unrestricted project mutation, publishing or CMS access outside granted Plugin/Server API capabilities |
| Figma | Structured collaborative interface design, components, prototyping and developer handoff | Official Plugin API and REST API; their read/write capabilities differ | Do not claim REST provides arbitrary remote canvas/node mutation or that Cutout currently provides live collaborative sync |
| Lottie | Portable JSON-based vector animation rendered natively on Android, iOS, Web and Windows; community open format | Airbnb Lottie runtimes and the Lottie Animation Community format/spec ecosystem | Do not treat arbitrary video, After Effects projects or unsupported expressions as losslessly convertible Lottie |
| Refero | Large searchable web/iOS screenshot reference collection | Searchable product surface; no general integration API was confirmed | Do not claim programmatic bulk access or reuse rights beyond explicit source/license evidence |
| Refero Styles | Curated `DESIGN.md` examples for AI agents covering colors, typography, spacing, components and design rules | Public browsable reference library | Do not treat extracted style examples as authoritative tokens for a Cutout project without user selection and provenance |

## Capability Matrix

Legend: **Strong** = a defining public strength; **Partial** = present but not
the product's complete center of gravity; **Not evidenced** = not established
by reviewed first-party material.

| Capability | Lovart | LiblibAI | Framer | Figma | Lottie | Refero / Styles |
| --- | --- | --- | --- | --- | --- | --- |
| Creative canvas | Strong | Partial, workflow-oriented | Strong, web-native | Strong, general structured canvas | Not an editor | Reference browsing only |
| Multimodal generation | Strong | Strong | Partial, AI web design | Partial, product capabilities vary | Not a generator | Not evidenced |
| Asset lineage | Product outcomes visible; public API not confirmed | Model/workflow community context | Versioned project behavior, exact lineage API not assumed | Versions/components/resources; exact generated lineage is product-specific | File/animation asset itself | Source references, not project lineage |
| Structured editor | Partial relative to generated outcomes | Workflow graph and generation controls | Strong | Strong | Structured animation format, not full product editor | No |
| Components/design systems | Campaign consistency focus | Model/workflow reuse | Strong reusable site components | Strong components, variables and libraries | Reusable animation assets | Styles provides examples, not live components |
| Motion | Video-ad outcome is publicly promoted | Image/video ecosystem capabilities vary | Effects and web interactions | Prototyping/interactions | Defining strength | Static references primarily |
| Collaboration | Not relied upon without stronger official evidence | Community sharing | Product collaboration | Defining real-time collaboration strength | Ecosystem collaboration, not document co-editing | Reference sharing/browsing |
| Publish | Campaign deliverables | Community/workflow outputs | Defining site publish path | Handoff/export rather than general site publish | Runtime deployment artifact | No target publish workflow |
| Reference search | Not primary | Model/community discovery | Project/site resources | Community/resources | Ecosystem docs/assets | Defining strength |

## Cutout Evidence And Gaps

| Area | Current authoritative evidence | Gap to target | Priority |
| --- | --- | --- | --- |
| Outcome-first Agent UX | `ProjectHome`, `IntentWorkspace`, `AgentWorkspaceDock`; outcome runtime and visible deliverables | Home/project lifecycle still exposes project mechanics before a user has a result; Agent direction/variants/selection need one coherent surface | P0 |
| Multimodal visual generation | `src/visual-generation`, paid desktop tool loop, durable request/attempt ledger, Brand VI DAG | No full creative-board loop for prompt/reference grouping, variant contact sheets, compare, favorite, branch and local edit | P0 |
| Asset lineage | Design IR sources, content hashes, material revisions, provenance, relations and durable receipts | Lineage is technically strong but not legible in normal UX; users need “derived from”, version ancestry, approval and cost on demand | P0 |
| Structured canvas/editor | Prototype plans and material canvas; Figma snapshot adapter | Generated results are still primarily deliverables, not universally editable structured nodes with stable selection/constraints | P0 |
| Component system | Explicit component candidates, Design Kit, Astryx binding, starter compiler | No direct canvas-to-explicit-component authoring UX, variant/property editor, story/state matrix or round-trip implementation status | P0 |
| Motion system | Brand VI catalog can request motion/Lottie output; motion quality gates exist | No Motion IR, timeline, easing/keyframe editor, Lottie validation/render preview or reduced-motion authoring | P1 |
| Collaboration | Local projects, durable runs and external controller protocol | No accounts, comments, multiplayer, branch review, permissions or remote project service; manifest explicitly states this | P1 |
| Publish/delivery | Verified Design/Brand/Starter exports; GitHub P1 previewed PR/check publish; Notion host adapter | No unified release center covering web preview, package, design handoff, campaign bundle and integration receipts | P1 |
| Reference search | Everything Inbox accepts explicit URL descriptors and files | No web/reference search; Refero-like discovery, rights filters, boards and reference dedupe are absent | P1 |
| Workspace search | `ProjectHome` directory has filter-as-you-type over project name/brief backed by local summaries | No unified ⌘K search across projects, runs and assets with grouped results; Manus's global search covers tasks only, so a mixed project+run index is a low-cost differentiator | P1 |
| Model/workflow ecosystem | Capability registry, Agent DAG, BYOK routing and Skills | No Liblib-like model/workflow marketplace, portable workflow packs, evaluation cards or creator attribution | P2 |
| Figma depth | Authorized snapshot Variables/components/Code Connect interchange | No plugin-mediated node create/update, Auto Layout, variants, interaction graph or conflict-aware node reconciliation | P1 |
| Framer depth | Framer declared adapter-required in Integration SDK | No official Plugin/Server API adapter, staging-site preview or approved publish workflow | P2 |

## P0: Lovart × Figma Product UX

### 1. One Outcome Surface

The first screen should contain one need composer with attachments and recent
outcomes. “Project”, DAG, model, executor, integration and export format remain
progressive details. A vague request receives a short creative direction with
assumptions; the Agent resolves production details itself.

### 2. Creative Board, Not Chat Transcript

After submission, the primary surface becomes a spatial result board:

- grouped reference tray with source/license state;
- live direction lanes rather than raw tool events;
- variant contact sheets with compare, favorite, reject and “more like this”;
- stable material selection shared by Agent edits and structured inspection;
- visible final-deliverable checklist, while retries and node execution remain
  hidden unless recovery is required.

### 3. Selection-Aware Agent

Every object or result selection should give the Agent bounded context:

- refine the selected region/material;
- preserve locked logo, palette, type, character and composition references;
- branch a new variation without overwriting the approved revision;
- explain the requested result and proposed visible change, not internal chain
  of thought or executor mechanics.

### 4. Promote Pixels To Structure

The user explicitly promotes approved visual regions into frames, text, image,
component and token bindings. The system may propose candidates, but must show
confidence/evidence and never silently invent component semantics. Structured
objects receive constraints, responsive behavior, states and provenance.

### 5. Result Inspector

The default inspector shows only user-relevant properties: size, content,
style, reusable component, responsive rule and delivery status. Advanced tabs
show tokens, provenance, revision ancestry, generation receipt and integration
bindings. This preserves Figma-like inspectability without turning the Agent
journey into an operations dashboard.

### 6. Unified Delivery Center

One delivery action should resolve the correct outputs from the outcome:

- visual masters and campaign assets;
- Brand VI and Design System Kits;
- components/starter repository;
- Figma/Framer integration plans;
- GitHub PR/check and Notion documentation receipts.

The user approves effects, destination and cost once. The harness performs
build, screenshot, accessibility, visual and provenance checks, then repairs
before presenting the final receipt.

## P1 And P2 Roadmap

### P1

- Motion IR plus Lottie JSON schema validation, runtime preview, reduced-motion
  fallback and frame/easing inspection.
- Reference discovery service with query, product/platform/pattern filters,
  board collection, duplicate detection and explicit license/provenance state.
- Figma plugin-mediated node apply and conflict-aware reconciliation.
- Review branches, comments, approvals and shareable read-only outcome links.
- Unified release center with GitHub/Notion/integration receipts.

### P2

- Framer Plugin/Server API adapter with staging preview and approval-gated
  publish.
- Portable model/workflow packs with provenance, cost, compatibility and
  evaluation cards; avoid copying marketplace mechanics without governance.
- Team libraries, remote asset indexing and organization policy.
- Advanced motion authoring and reusable motion components.

## Official Sources

- Lovart: [official product page](https://www.lovart.ai/)
- LiblibAI: [official product page](https://www.liblib.art/)
- Framer: [Design](https://www.framer.com/design/), [Plugin API introduction](https://www.framer.com/developers/plugins-introduction), [Server API introduction](https://www.framer.com/developers/server-api-introduction), [Code Components](https://www.framer.com/developers/components-introduction)
- Figma: [Design](https://www.figma.com/design/), [Prototyping](https://www.figma.com/prototyping/), [Dev Mode](https://www.figma.com/dev-mode/), [Plugin API](https://developers.figma.com/docs/plugins/), [REST API](https://developers.figma.com/docs/rest-api/), [API comparison](https://developers.figma.com/compare-apis/)
- Lottie: [Airbnb Lottie documentation](https://airbnb.io/lottie/), [Lottie Animation Community](https://lottie.github.io/)
- Refero: [official product page](https://refero.design/)
- Refero Styles: [official library](https://styles.refero.design/)

## Research Constraints

- Public pages were inspected as available on 2026-07-12.
- Authenticated-only capabilities were not tested.
- No undocumented endpoints, scraped private data, reverse-engineered APIs or
  third-party feature summaries were used as evidence.
- Product capability can change; implementation work must re-check the linked
  official documentation at execution time.
