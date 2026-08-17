# Canvas + Agent Primary Architecture

## Interaction Ownership

```text
Home / Project composer
        |
        v
unambiguous Profile routing -------- unmatched / ambiguous
        |                                      |
        v                                      v
Agent-controlled Profile launch          general Agent pipeline
        |                                      |
        +------------------+-------------------+
                           v
                 Project Canvas surface
                 - artifact board
                 - Product UI/UX output
                 - Commerce production/review/delivery stage
                 - Game production/review/delivery stage
                           |
                           v
             Design IR + provenance + exact receipts

Project tools -> Files | Git | Library | DESIGN.md | Inspect project | Delivery details
Inspect project -> existing Workbench (optional compatibility/diagnostics)
```

The lifecycle remains in data and Agent execution. It is no longer encoded as
mandatory user navigation.

## Boundaries

### Workspace shell

`IntentWorkspace` continues to own the Agent drawer and Canvas. It gains one
ephemeral Canvas Profile stage state:

```ts
type CanvasProfileLaunch =
  | { kind: "commerce"; sourceText: string }
  | { kind: "game-assets"; launch: GameAssetLaunchRequest }
```

The launch is presentation state only. Durable Commerce output continues to
live in `WorkspaceSnapshot.commerceProjectLifecycle`; Game durability remains
owned by its existing production contracts.

The left rail becomes a narrow primary affordance for Agent plus one Project
tools menu. Existing drawers remain mounted through the same single
`activeWorkspacePanel` state, so the change does not introduce competing drawer
authority.

### Scenario routing

`workspace/scenario-launch.ts` remains the lazy-loaded advisory router used by
Home and Project composers. It adds a conservative Commerce recognizer alongside
the existing Game recognizer. The router returns a discriminated Profile launch
or `agent`; multiple matches fall back to Agent rather than guessing.

Home launches cross the AppShell/PipelineCanvas boundary as a one-shot,
project-bound `CanvasProfileLaunch`. In-project launches are applied directly by
`IntentWorkspace`. Both routes converge on the same Canvas stage component.

### Canvas Profile stage

The stage is a full-height Canvas projection inside the existing main surface,
with Agent still mounted beside it. It has a compact header, current Profile
identity and a close action that restores the existing OutputCanvas without
resetting Agent or Project state.

- Commerce mounts `CommerceProductionPanel` in Project-only mode. Completion
  creates the current revision's lifecycle record. A Canvas-native review view
  shows all retained previews and exact Provider/QA/playback receipt ids,
  accepts the ordered artifact hash closure, and downloads only after acceptance.
- Game Asset lazy-loads the existing `GameAssetProductionPanel` with the exact
  `GameAssetLaunchRequest`. No Game engine or contract file is changed.
- Product UI/UX remains the existing OutputCanvas. Design-system artifact links
  focus the existing Canvas item instead of changing drawer state.

### Optional Workbench

`openDesignOs` remains the compatibility and inspection API. It is invoked by
Project tools, not by the Profile router. Existing inline delivery and dialog
routes remain available during migration so deep links and diagnostics do not
regress.

## Commerce Data Flow

```text
Commerce Canvas production completes
  -> createCommerceProjectLifecycleRecord(current revision, result)
  -> WorkspaceSnapshot persistence
  -> Canvas review projects retained bytes + receipts
  -> acceptCommerceProjectLifecycleRecord(exact ordered hashes)
  -> WorkspaceSnapshot persistence
  -> downloadCommerceProjectFiles
  -> requestCommerceProjectDownload(exact accepted hashes)
  -> WorkspaceSnapshot persistence
```

No step infers acceptance from completion. A revision mismatch disables accept
and download and requires regeneration.

## Compatibility And Rollback

- Existing Workbench routes and components are reused, not deleted.
- Existing drawer components remain available from Project tools.
- Profile production components stay lazy so the initial Project bundle does
  not eagerly load Commerce or Game DAGs.
- The feature can roll back by restoring the six rail entries and routing
  Profile launches through `openDesignOs`; durable Project state is unchanged.
- No public Agent contract changes are required. `pnpm agent:validate` still
  guards against accidental drift because the desktop Agent surface changes.

## Trade-offs

- Reusing current bounded Profile panels avoids rewriting proven production and
  review logic, but the first Canvas stage is a structured artifact surface
  rather than free-positioned nodes for every Profile artifact.
- Keeping Workbench compatibility temporarily leaves duplicate internal
  projection code. It is intentionally hidden from normal flow until Profile
  Canvas projection parity is proven.
- Conservative intent recognition may leave some Commerce requests on the
  general Agent path. That is preferable to silently selecting the wrong
  Profile.
