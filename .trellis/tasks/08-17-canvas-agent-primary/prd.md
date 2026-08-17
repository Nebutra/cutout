# Make Canvas and Agent the primary Design OS

## Goal

Make Cutout feel like an Agent-native Design OS instead of a collection of
scenario workbenches. The user states an outcome and durable rules in the Agent
Panel, then creates, compares, reviews, repairs and delivers the resulting work
on the infinite Canvas. Project Workbench remains available only as an optional
inspection and recovery surface.

The normal interaction model is therefore:

```text
conversation -> Agent-owned plan and execution -> Canvas artifacts/review
             -> exact approval or repair       -> delivery
```

Brief, Sources, Create, Review and Deliver remain real lifecycle states in
Design IR and receipts. They are not primary navigation that the user must walk
through.

## Confirmed Facts

- The Agent drawer already defaults open and owns conversation, execution
  progress, approvals, cancellation, retry and artifact links.
- The existing Project Canvas already owns artifact presentation, annotations,
  focus, comparison, export and Library actions.
- Product UI/UX creation already runs through Agent and projects results onto
  Canvas.
- Commerce has a retained, revision-bound production lifecycle with exact
  artifact hashes, review acceptance and browser delivery records.
- Game Asset has an intent recognizer and a complete production surface, but its
  natural-language route currently opens Project Workbench.
- Project Workbench currently exposes a six-stage lifecycle and Profile tabs.
  Its internal evidence, receipt and recovery views remain useful, but that
  information architecture is implementation-shaped rather than the normal
  user journey.
- The workspace rail currently presents Agent, Files, Git, Assets, Design and
  Deliver as peers even though only Agent and Canvas are primary interactions.
- `.cutout` Design IR, provenance, policy, approvals and receipts remain the
  authority regardless of presentation.

## Requirements

### R1. Two-surface primary interaction

- Agent is the primary intent and control surface and remains open by default.
- Canvas is the primary artifact, comparison, review and delivery surface.
- Primary workspace chrome must not present Files, Git, Assets, Design,
  Deliver, Commerce or Game Asset as peer application modes.
- Secondary tools remain reachable through one progressively disclosed Project
  tools control.

### R2. Agent-owned scenario selection

- Product UI/UX, Commerce and Game Asset are Agent skills/Profile capabilities,
  not tabs the user must select before describing the outcome.
- Natural-language intent may select a specialized Profile only when the intent
  recognizer has one unambiguous match. Ambiguous or unmatched requests remain
  in the general Agent path.
- Game and Commerce intent launched from either Home or the in-project Agent
  must stay in the Project workspace and open a Canvas production stage, not
  Project Workbench.
- Scenario routing remains advisory UI projection. It cannot install a Profile,
  authorize execution, advance approval or claim readiness.

### R3. Canvas production and review

- Specialized Commerce and Game production may reuse their existing bounded
  production components, but they mount as Canvas content beside the Agent.
- A specialized Canvas stage has an explicit return to the artifact board and
  cannot strand the user in a separate mini-application.
- Commerce production persists its existing revision-bound lifecycle record.
  Current retained artifacts, Provider/QA/playback receipts, exact acceptance
  and download must be reachable without opening Workbench.
- Stale Commerce results remain blocked from acceptance and delivery.
- Game Asset retains its exact launch request, input, review, repair and bundle
  behavior when moved out of Workbench.
- Product UI/UX Agent artifact links focus the corresponding Canvas artifact;
  they do not open the DESIGN.md inspector as a substitute for the artifact.

### R4. Conversation-compiled durable rules

- User-authored rules continue to become durable Project/Design IR state and
  DESIGN.md evidence through the existing Agent pipeline.
- Files, Git, Library, DESIGN.md and Project Workbench are optional inspection
  tools. None is a prerequisite for a normal create-review-deliver outcome.
- Designer and Builder users see the same authority and artifacts. Builder
  details are progressive evidence, never a separate workflow.

### R5. Optional Workbench compatibility

- Project Workbench remains available as `Inspect project` for DAG, receipts,
  governance, diagnostics, benchmark isolation and manual recovery.
- Existing legacy Workbench routes may continue to resolve for compatibility,
  but no primary rail item or Agent scenario launch may require them.
- Delivery details may remain available under Project tools while direct Canvas
  export and Profile delivery stay primary.

### R6. Truthful capability and safety boundaries

- The refactor changes presentation and orchestration ownership only. It does
  not weaken preview, explicit approval, revision, provenance or receipt rules.
- It must not claim live Figma sync, web fetch/search, video processing, cloud
  collaboration, arbitrary paths or a headless Provider.
- It must not turn deterministic fixtures or mocked Hosts into production,
  benchmark or SOTA evidence.
- Public CLI/MCP/protocol/manifest contracts remain unchanged unless a real new
  public capability is implemented and synchronized across all surfaces.

## Acceptance Criteria

- [ ] A1: Desktop primary workspace chrome exposes Agent plus one secondary
  Project tools control; Canvas remains the always-present main surface.
- [ ] A2: Files, Git, Assets, DESIGN.md, Inspect project and Delivery details are
  reachable from Project tools without becoming primary modes.
- [ ] A3: A Game Asset request submitted in the in-project Agent opens the exact
  launch request in a Canvas production stage and does not open Workbench.
- [ ] A4: A Game Asset request submitted from Home enters the same Project Canvas
  production stage after project creation.
- [ ] A5: An unambiguous Commerce localization/material request opens Commerce
  production on Canvas; unrelated product/UI prompts stay on the general Agent
  route.
- [ ] A6: Commerce completion, retained review evidence, exact acceptance and
  download are possible on Canvas with stale-revision blocking intact.
- [ ] A7: Product UI/UX design-system and page artifact links focus Canvas
  artifacts and keep the Agent available.
- [ ] A8: Closing a specialized production stage returns to the same mounted
  artifact board and Agent conversation.
- [ ] A9: `Inspect project` opens the existing Workbench as optional evidence and
  recovery UI; no normal acceptance criterion above depends on opening it.
- [ ] A10: Focused unit/component tests, desktop/mobile headless journeys, lint,
  build, `pnpm agent:validate` and scoped diff checks pass.
- [ ] A11: Existing Product UI/UX, Commerce and Game production contracts retain
  their authority boundaries; no mock or unavailable capability is presented as
  production-ready.

## Out of Scope

- Replacing the Design OS Kernel or creating a single mega-IR.
- Implementing a general video-processing Host, live Figma sync, cloud
  collaboration or a public headless Provider.
- Rewriting the Game Asset production engine while parallel Game work is active.
- Removing Project Workbench or breaking its legacy deep links in this slice.
- Treating browser download requests as verified filesystem delivery receipts.
