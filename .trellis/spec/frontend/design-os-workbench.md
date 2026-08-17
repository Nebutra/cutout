# Canvas + Agent Design OS

> Desktop interaction and projection contract for one Project across Product
> UI/UX, Brand, Commerce, Game Asset, and future design Profiles.

## Scenario: Agent-Owned Outcome Delivery On Canvas

### 1. Scope / Trigger

Apply when changing Project navigation, Agent scenario routing, Canvas artifact
projection, Profile production/review, secondary Project tools, or the legacy
Workbench. Canvas and Agent are the normal product; Workbench is an optional
inspection and recovery view over the same Design IR, evidence, and receipts.

### 2. Signatures

```ts
type WorkspacePanel = "agent" | "files" | "git" | "design"

type CanvasProfileLaunch =
  | { readonly kind: "commerce"; readonly sourceText: string }
  | { readonly kind: "game-assets"; readonly launch: GameAssetLaunchRequest }

type WorkspaceSubmissionRoute =
  | { readonly kind: "agent" }
  | { readonly kind: "commerce"; readonly intent: CommerceMaterialIntent }
  | { readonly kind: "game-assets"; readonly intent: GameAssetIntent }

interface CanvasProfileStageProps {
  readonly launch: CanvasProfileLaunch
  readonly currentRevisionId: string | null
  readonly commerceLifecycle: CommerceProjectLifecycleRecord | null
  readonly onCommerceLifecycleChange: (
    record: CommerceProjectLifecycleRecord | undefined,
  ) => void
  readonly onClose: () => void
}

type CommerceProjectLifecycleRecord = {
  readonly designRevisionId: string
  readonly result: CommerceProjectProductionResult
  readonly review?: { readonly status: "accepted" }
  readonly delivery?: { readonly status: "download-requested" }
}
```

The compatibility Workbench may still use `DesignOsWorkbenchSection`,
`DesignOsProfileId`, and `DesignOsWorkbenchLens`, but those types describe an
inspection projection. They do not define primary application navigation.

### 3. Contracts

- The primary Project has two surfaces: Agent owns intent, planning, progress,
  approval, repair, cancellation, and retry; Canvas owns artifacts, comparison,
  review, and delivery. The lifecycle remains durable state, not a sequence of
  tabs the user must operate manually.
- Desktop chrome exposes only `Agent` and `Project`. On narrow screens the same
  two controls live in workspace boundary chrome between Canvas and the active
  drawer, or at the Canvas edge while no drawer is open. The Agent drawer opens
  by default and remains recoverable after it is hidden.
- `Project tools` progressively discloses Files, Git, Library, DESIGN.md,
  `Inspect project`, and `Delivery details`. None is required for the normal
  create-review-deliver path.
- Natural-language routing is conservative. Exactly one unambiguous Commerce or
  Game match may create a typed `CanvasProfileLaunch`; unmatched or ambiguous
  requests stay with the general Agent. Routing cannot install a Profile,
  authorize execution, approve output, or claim readiness.
- Home and in-Project Profile requests converge on the same Project-bound Canvas
  stage. A pending Home launch is bound to the newly created Project id and is
  consumed once, so it cannot leak into another Project.
- Game mounts its existing production panel with the exact launch request.
  Commerce mounts Project-only production. Both keep the Agent mounted and offer
  an explicit return to the existing artifact board.
- Product UI/UX remains the ordinary artifact Canvas. Agent artifact links focus
  the actual Canvas artifact; DESIGN.md is optional evidence, not a substitute
  destination.
- Commerce completion creates a revision-bound lifecycle record and never
  implies acceptance. Canvas review displays retained artifacts plus exact
  Provider, QA, and playback receipts before accepting the ordered artifact hash
  closure. Revision drift blocks acceptance and download. Browser delivery
  records only `download-requested`; it is not a filesystem receipt.
- `.cutout` Design IR, provenance, policies, approvals, and receipts remain
  authoritative. Canvas stage state is presentation state only; persisted
  Profile output uses its owning schema and Project snapshot contract.
- `Inspect project` may open the existing six-stage Workbench for DAG evidence,
  governance, diagnostics, benchmark isolation, and manual recovery. Legacy deep
  links may resolve there, but no Agent Profile launch or ordinary acceptance
  path may depend on it.
- Designer and Builder are views over the same artifacts and authority. Builder
  evidence is progressively disclosed; it cannot create a second workflow or
  grant commands that the Designer view lacks.
- Motion stays capability-required until an authorized temporal Host exists.
  The UI must not imply video processing, live Figma sync, web fetching, cloud
  collaboration, arbitrary paths, or a public headless Provider.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Desktop Project opens | Show Agent plus Project rail controls and the Canvas |
| Narrow-screen Project opens | Show Agent plus Project controls at the Canvas/drawer boundary |
| Agent is hidden on narrow screen | Keep the Canvas Agent control visible so it can reopen |
| Files, Git, Library, or DESIGN.md is requested | Open it from Project tools without changing primary navigation |
| Inspect project is requested | Open the compatibility Workbench over the same Project state |
| Game intent is unambiguous | Open Game production on Canvas with the exact parsed request |
| Commerce intent is unambiguous | Open Commerce Project production on Canvas |
| More than one Profile matches | Keep the request in the general Agent path |
| Product UI/UX artifact link is activated | Focus the corresponding Canvas artifact |
| Specialized stage is closed | Restore the same mounted artifact board and Agent conversation |
| Commerce result completes | Persist production bound to the current revision; do not accept it |
| Commerce revision is stale | Disable acceptance and download; offer regeneration |
| Commerce exact hashes are accepted | Persist explicit review against that ordered closure |
| Accepted Commerce output is downloaded | Download retained files and record `download-requested` only |
| Fixture or mocked Host passes | Treat it as contract evidence only; do not claim production or SOTA |
| Motion Host is absent | Render capability-required rather than an enabled action |

### 5. Good / Base / Bad Cases

- Good: the user asks the Agent for localized Commerce material, production and
  retained review appear on Canvas, the exact current closure is accepted, and
  files are downloaded without opening Workbench.
- Base: an unmatched Product UI/UX request stays with the general Agent, whose
  result links focus the existing Canvas artifacts.
- Bad: add Commerce as a top-level app tab, force the user through Brief/Create/
  Review/Deliver navigation, infer acceptance from completion, or label fixture
  output as verified production evidence.

### 6. Tests Required

- Unit-test conservative Commerce/Game routing, ambiguous fallback, exact typed
  launches, and one-shot Project binding from Home.
- Component-test Agent/Project control parity, Radix trigger ref/prop forwarding,
  Profile stage close/restore, exact Game launch forwarding, Product artifact
  focus, and Workbench as an optional secondary action.
- Unit/component-test Commerce lifecycle create/accept/download ordering, exact
  hashes, retained previews and receipts, stale blocking, snapshot round-trip,
  and malformed persistence rejection.
- Run native narrow-screen Playwright journeys without widening the viewport.
  Assert Agent and Project controls are reachable, Profile requests remain on
  Canvas beside Agent, Workbench is absent from the normal flow, and the document
  does not overflow.
- Run focused Profile regressions, TypeScript/lint/build, `pnpm agent:validate`,
  product-skill validation, and scoped diff checks. Deterministic fixtures prove
  contracts and failure behavior only.

### 7. Wrong vs Correct

```tsx
// Wrong: domain and lifecycle internals become primary product navigation.
<PrimaryRail items={["Brief", "Sources", "Create", "Review", "Deliver", "Commerce"]} />
openDesignOs("game-assets", { gameAssetLaunch })

// Correct: Agent selects a bounded Profile projection on the existing Canvas.
<PrimaryRail items={["Agent", "Project"]} />
setCanvasProfileLaunch({ kind: "game-assets", launch: gameAssetLaunch })

// Wrong: successful Provider execution silently becomes deliverable.
const record = { result, review: { status: "accepted" } }

// Correct: production and exact review remain separate state transitions.
const produced = createCommerceProjectLifecycleRecord({ designRevisionId, result })
const accepted = acceptCommerceProjectLifecycleRecord(produced, orderedArtifactHashes)
```
