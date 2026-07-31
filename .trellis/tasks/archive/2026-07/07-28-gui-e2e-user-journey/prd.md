# Run complete GUI user journey and harden failures

## Goal

Validate and harden the real packaged Cutout user journey from an ordinary idea
to reusable, attributable UI/UX design materials and complete resource packs. The test must be
performed through the visible Cursor and Cutout interfaces, using credentials
that Cutout discovers from already configured local Coding Agents rather than
manually entering a provider API key.

Success means a user who has already configured a supported local Coding Agent
can reach a useful creative result without understanding provider plumbing,
and that failures are traced to the responsible UX, routing, orchestration,
model, context, or artifact contract instead of being hidden behind a shallow
green test.

## Background

- The packaged release under test is `v0.1.12` from GitHub `main`.
- Cutout supports automatic local Agent/provider discovery, bounded Design
  System candidate generation, full-plan prototype generation, material
  processing, slicing, Design IR persistence, and controlled exports.
- Current source advertises Google image-generation support and known models
  including `imagen-3`, `gemini-2.5-flash-image`, and
  `gemini-3.1-flash-image-preview`. The user's term `Imagen 2` is treated as the
  intended production image capability, not as permission to fabricate a model
  identifier that the installed app does not expose.
- Multiple complete prototype-suite alternatives are not currently represented
  as shipped merely because multiple Design System candidates are supported.
  The E2E must report that boundary truthfully and may implement the missing
  product path when required for the requested outcome.

## Requirements

### Native execution closure

- Restore signed desktop builds to OS-backed secret storage. The temporary
  plaintext `secrets.json` fallback used by unsigned local builds is not an
  acceptable production credential boundary. Migration must be one-way,
  remove plaintext after successful Keychain persistence, and never return a
  secret through IPC or logs.
- Automatic setup must be able to select an exact reviewed, importable local
  Agent credential, run the authenticated catalog check, persist a verified
  Cutout Provider, and assign eligible text and image tasks without requiring
  the user to type a key. OAuth/session-only discoveries remain non-importable.
- The production Provider executor must be available to both the normal
  desktop workflow and the packaged background E2E host. It must use the same
  Rust origin/protocol/secret binding, approval lease, budget, receipt, and
  content-addressed artifact contracts as foreground execution.
- Add a packaged-app background E2E mode that renders the real WebView without
  activating or focusing its window, drives the real UI contract, and emits a
  credential-free result/evidence bundle. It may be enabled only in a dedicated
  E2E build and must not add a general remote-control or arbitrary-script API.
- Coding generation is not part of this release's user journey or completion
  contract. A failed or unavailable Coding backend must not block, dilute, or
  falsely qualify the Design System, prototype, material, or resource-pack
  result.

### Environment and interaction

- Run the final critical path inside a clean, snapshot-backed macOS virtual
  machine rather than treating the developer host or browser fixtures as user
  isolation. The VM must run without graphics and must not activate or focus a
  host application.
- Establish the supported local-Agent premise before Cutout's first launch by
  transferring only the reviewed Agent configuration required for discovery
  into the guest with owner-only permissions. Do not expose values in command
  output, shared evidence, screenshots, or logs, and do not type a Provider API
  key into Cutout.
- Keep application input and sanitized output mounts separate. Credentials must
  never live on a host/guest shared directory. Preserve a pre-Cutout snapshot so
  the full journey can be rerun without stale project, local-storage, Keychain,
  approval, or artifact state.
- Install and launch the signed, notarized public `v0.1.12` arm64 package after
  validating its public release assets, hashes, updater metadata, Gatekeeper,
  and stapled notarization ticket.
- Preserve the previous application bundle recoverably in Trash before
  replacement. Do not delete user data or credentials.
- Start from a clean Cursor window/workspace state and interact through GUI
  controls only for the product journey. Do not call Cutout business APIs or
  provider generation endpoints directly to manufacture success.
- Do not manually type a provider API key. Use Cutout's automatic discovery and
  authorization path for an already configured Claude, Codex, or another
  reviewed local Coding Agent source.
- Verify that a usable text/reasoning route and a usable image-generation route
  exist. Discovery of a directory or credential hint alone is not sufficient.
- Begin with casual product ideation in chat, allow the Agent to refine intent,
  and interact with approval, clarification, retry, comparison, selection, and
  continuation bubbles as a user would.

### Creative deliverables

- Produce three meaningfully different Design System candidates for one shared
  product idea and inspect their visual references plus generated `DESIGN.md`
  and token projections.
- Produce three corresponding complete prototype suites. Each suite must use a
  distinct Agent-authored route graph; route count and names are not fixed by
  production code. A suite cannot pass as a single landing page.
- Each alternative derives its own route count from its Design System
  direction, business content model, and complete journeys. The first suite's
  page count is context, never a quota copied to its siblings.
- Let the Agent derive each suite's page count, route topology, and useful
  material scope from the real product scenario and complete user journeys.
  Each material must be non-UI visual content worth reusing and must bind to its
  source page/region; no fixed per-page count is valid across domains. Produce
  three independently attributable resource packs. The test may surface a
  truthful product limitation instead of fabricating missing assets.
- Preserve provenance from selected Design System through prototype pages,
  slices, previews, and resource-pack exports.

### Production latency

- Treat end-to-end latency and paid-request amplification as delivery
  requirements. A graph that eventually produces the requested artifacts but
  takes hours because it repeats hidden generation work does not pass.
- Compile the resolved graph into an explicit image-request budget before
  execution: Design System calls + actual pages + actual boards + explicit
  standalone assets. Regression fixtures must include heterogeneous per-page
  material scopes, including pages with zero reusable visuals, and derive their
  expected call count from that authored graph.
- Production and primary E2E fixtures own no fixed page or per-page material count. In production,
  route topology comes from the user's outcome, business domain, content model,
  platform conventions, and complete user journeys. A number mentioned by the
  user is planning evidence, not an automatic authority over that topology;
  the Agent may clarify or explain a different complete scope. The request
  budget is compiled only after the route graph resolves.
- Each page attempt uses one reference-conditioned image call. Visual QA records
  evidence by default and must not trigger an automatic paid re-roll; any
  regeneration is a later explicit, bounded attempt.
- Do not add mandatory refine calls, text-free page prepasses, or sibling-wide
  reference uploads to the baseline DAG. Keep visual context bounded to the
  selected Design System and at most one stable anchor where continuity needs
  it.
- Generate independent pages and Agent-authored board groups with measured bounded concurrency.
  Progress evidence must expose logical completion and image-call counts so a
  slow Provider can be distinguished from orchestration amplification.

### Asset delivery quality

- Treat each selected Design System, `DESIGN.md`, token projection, route
  graph, full prototype page set, material manifest, and resource pack as one
  attributable delivery bundle.
- Preview the exact page and material contents before export and require the
  selected suite's visible consumable assets to equal its completed production
  authority.
- Validate that every resource is useful non-UI visual content, carries its
  source page/region and content hash, and can be consumed independently from
  the Cutout project without fabricating a Coding result.

### Diagnosis and fixes

- Keep a timestamped journey log with screenshots and exact visible states.
- Classify every material failure as environment/discovery, capability
  evidence, model routing, approval, orchestration, context construction,
  persistence/provenance, generation quality, slicing, export, or UX.
- For failures inside repository scope, identify the causal code path, add a
  focused regression, implement the smallest coherent product fix, rerun the
  affected GUI segment, and then rerun the end-to-end critical path.
- Keep `cutout.agent-capabilities.json`, CLI, MCP, control protocol, manifests,
  docs, and generated plugin data synchronized for any Agent-surface change.
- Preview ingestion and exports before approved apply. Never invent approval,
  capability, successful provider evidence, or generated deliverables.

## Out Of Scope

- Manually provisioning a new third-party API credential.
- Claiming live Figma sync, web search/fetch, video processing, cloud
  collaboration, or a headless image provider.
- Treating mocked component tests as proof that the packaged GUI journey works.
- Commercial subscription packaging for candidate counts.

## Acceptance Criteria

- [ ] A clean macOS VM is provisioned from a pinned public image, started
      without graphics, and snapshotted before Cutout's first launch.
- [ ] The guest contains only the reviewed local-Agent premise needed for
      automatic discovery; no Provider secret appears in host command output,
      shared mounts, screenshots, or the sanitized result bundle.
- [ ] The complete packaged journey runs inside the VM and is repeated from the
      clean snapshot after severe fixes, proving success does not depend on
      developer-host state or a previously warmed Cutout profile.
- [ ] Public `v0.1.12` release and installed arm64 app pass integrity, signing,
      Gatekeeper, notarization, version, and launch checks.
- [ ] A clean GUI session automatically discovers and authorizes a usable local
      AI source without manual provider-key entry.
- [ ] The UI proves both text/reasoning coverage and image-generation coverage, or
      exposes a precise actionable failure without conflating discovery with
      capability.
- [ ] The chat begins from casual ideation and reaches an executable plan
      through visible Agent interactions.
- [ ] Three Design System candidates are generated, compared, and individually
      inspectable with `DESIGN.md` and token outputs.
- [ ] Three complete, distinct route suites are generated or a confirmed
      missing product capability is implemented and then validated.
- [ ] Three resource packs contain useful attributable page assets whose counts
      and production routes come from each Agent-authored material plan.
- [ ] The live benchmark's actual image-call count equals its dynamically
      compiled baseline: Design System calls + actual page attempts + actual
      board groups + actual standalone assets, with zero automatic QA re-rolls,
      no hidden refine/prepass nodes, and bounded reference context.
- [ ] Fresh-VM evidence records Design System, page, board, and complete-journey
      elapsed times plus actual image-call count and observed concurrency.
- [ ] The selected suite exposes a complete previewable resource pack whose
      visible consumable count exactly matches its completed production run.
- [ ] Every suite's exported Design System, route graph, pages, slices, and
      material manifest retain exact provenance and remain independently
      attributable.
- [ ] Every encountered blocking or severe UX/product defect is root-caused,
      fixed when in scope, covered by a regression, and retested through GUI.
- [ ] `pnpm agent:validate`, lint, type-check, focused tests, production build,
      relevant Rust checks, and the release-critical browser gate pass after
      changes.
- [ ] Evidence distinguishes verified success, partial success, product gaps,
      provider/model quality issues, and untested residual risk.
- [ ] Production secrets are stored in the OS credential vault; any legacy
      plaintext Cutout secret file is migrated and deleted without exposing
      values outside native code.
- [ ] A reviewed importable local Agent credential can be auto-configured and
      assigned through a single native transaction after an authenticated
      catalog check.
- [ ] Real `tool.invoke` image generation runs through a host executor and
      records a paid-tool receipt and content-addressed output; headless control
      no longer returns `capability-required` when the packaged host is bound.
- [ ] A packaged macOS E2E build completes its hidden WebView journey without
      activation/focus and writes sanitized machine-readable evidence.
- [ ] The packaged result reaches terminal `passed` at the completed selected
      resource-pack boundary and contains no simulated or required Coding
      outcome.

## Notes

- User authorization covers this E2E execution, installation of the already
  requested Cutout update, use of existing local Agent configuration, and
  repository fixes required to complete the journey.
