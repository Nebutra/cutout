# Cutout — Pipeline Canvas Orchestration Design

**Status:** design for review · **Depends on:** React Flow (`@xyflow/react`, MIT — chosen in the canvas trade-off), the shipped cutout worker/store (`src/algorithm`, `src/store`, `useAnalysisBridge`), BYOK generation (`GenerationService.generateImages`, image slot), the prompt catalog (`src/prompts`). · **Scope:** replace the two-tab Source panel + 3-pane workspace with **one node-graph canvas** that models the whole chain, and orchestrate the transitions between stages. **Not** in scope: a fully freeform arbitrary-wiring graph (V1 is a structured pipeline on a canvas; the model is graph-capable for later).

---

## 1. Intent — the app IS one pipeline

The two tabs (`导入素材图` / `从截图生成`) were **means**, not **stages**. The product is a single directed chain; each artifact is a node, each node is filled either by **generating from the upstream node** or by **importing your own**, and the key transitions are **bidirectional**:

```
需求(brief) ──①生成──► 原型图(mockup) ──②拆解──► 素材板(board, 透明) ──③抠图──► 切片(slices) ──► 导出
   text                image              ◄──②'合成(反向)──   image, cutout-ready       pixel pipeline    cut assets
   每个节点都可「导入」自己的成品 · 边 = 有向转化 · ②③ 之间可双向
```

## 2. Locked decisions (trade-offs)

1. **Canvas engine = React Flow (`@xyflow/react`)** — MIT, node-native (nodes are plain React components), offline, tiny; the canvas UX (pan/zoom/minimap/controls) is out-of-the-box. tldraw rejected: source-available, ~$6k/yr license-key + watermark, and freeform-whiteboard-shaped (we need node+edge). (Full trade-off in the prior research turn.)
2. **V1 topology = a structured linear pipeline rendered on the canvas** (auto-laid-out left→right chain) — real canvas feel now, without a graph-execution engine. The orchestration model below is **graph-capable** (typed nodes + typed edges + a transition runner), so opening it to freeform (branch, multiple mockups, add-node) is additive later.
3. **Reuse, don't rewrite.** The pixel pipeline (worker/params/slices) plugs into the `board→slices` edge unchanged. Generation reuses `GenerationService.generateImages` + the Settings image slot. New work is the canvas + two prompts + the vision-naming step.
4. **Aesthetic = calm/opaque.** Nodes are plain shadcn cards; the canvas background is flat (NO dotted-glass / mock / neon). Follows the project's UI rule (reverted the glassy reshape earlier).

## 3. Node & transition model

| Node (stage) | Artifact | Filled by | Forward transition | Reverse |
|---|---|---|---|---|
| `brief` | text | typing | **generate** → mockup | — |
| `mockup` | image (UI prototype) | generate(brief) / **import** screenshot | **deconstruct** → board | ◄ compose(board) |
| `board` | image (transparent, cutout-ready) | deconstruct(mockup) / **import** sheet | **cutout** → slices | ◄ **compose** → mockup |
| `slices` | cut assets (+ names) | cutout(board) | export / **name** (vision) | — |

Transition ops: `generate` · `deconstruct` · `compose` (reverse) · `cutout` (deterministic) · `name` (vision). Every node also supports `import` (drop your own artifact at that stage — subsumes both old tabs).

## 4. State orchestration — Zustand `pipeline` slice

A graph the canvas renders and a runner executes. Kept separate from React Flow's view state (RF holds positions/selection; the store holds artifacts/status — the source of truth).

```ts
// store/slices/pipeline.ts
type StageKind = 'brief' | 'mockup' | 'board' | 'slices'
type NodeStatus = 'empty' | 'ready' | 'running' | 'error'
type Op = 'generate' | 'deconstruct' | 'compose' | 'cutout' | 'name'

interface StageNode {
  readonly id: string
  readonly kind: StageKind
  readonly status: NodeStatus
  readonly error?: string
  // stage-specific artifact (only one is set per kind):
  readonly brief?: string
  readonly image?: { bitmap: ImageBitmap; blob: Blob; w: number; h: number } // mockup | board
  // slices reuse the existing analysis slice (store.analysis) — not duplicated here
}
interface Transition { readonly id: string; readonly source: string; readonly target: string; readonly op: Op; readonly status: NodeStatus }

interface PipelineState { nodes: StageNode[]; transitions: Transition[] }
interface PipelineActions {
  setBrief(id: string, text: string): void
  importArtifact(id: string, artifact): void          // fill a node from a file
  runTransition(id: string): Promise<void>            // the runner (see §6–8)
  resetFrom(id: string): void                         // clear downstream when an upstream changes
}
```

- **`board` node ⇄ existing cutout state.** The `board` artifact IS the cutout **source**: setting it calls `store.loadImage(...)`, which triggers `useAutoRun` → the worker → `store.analysis` (preview + slices). So the `board→slices` transition is the pipeline we already have; the `board` node hosts the **parameter sliders + transparent preview**, the `slices` node hosts the **slice grid + inspector**. No algorithm change.
- **Staleness.** Changing an upstream artifact (`resetFrom`) clears downstream nodes so the canvas never shows a board that no longer matches its mockup.

## 5. React Flow integration

```
src/components/canvas/
  PipelineCanvas.tsx        # <ReactFlow> host: nodes/edges from the store, controls, minimap, flat bg
  layout.ts                 # deterministic left→right x/y for the linear chain (no dagre needed in V1)
  nodes/
    BriefNode.tsx           # brief textarea + [✨ 生成原型图] + [导入原型图]
    MockupNode.tsx          # mockup image + [拆解为素材板 ▶] [重新生成] [导入替换] [◄ 反向]
    BoardNode.tsx           # transparent preview + ParameterControls (reused) + [导入替换] [◄ 合成原型图]
    SlicesNode.tsx          # SliceGrid (reused) + [语义命名] + export; expandable
  edges/TransitionEdge.tsx  # directed edge with a run button + running/done/error state
```

- **Nodes are custom React components** = plain shadcn cards → calm/opaque, reuse `ParameterControls`, `SliceGrid`, `DropZone`, `ProviderRow`-style patterns. This is why React Flow fits: we fully own the node UI.
- `PipelineCanvas` replaces `WorkspaceLayout` in `AppShell`. TopBar/StatusBar/Settings unchanged. Canvas `Background` = a subtle flat dot/none (opaque), `Controls` + `MiniMap` for the "画布感".
- View state (positions) may be layout-driven (fixed chain) in V1; store owns artifacts/status.

## 6. Generation transitions (via BYOK image slot)

All go through `GenerationService.generateImages({ providerId, model, promptRef, input })` (the images-endpoint path already handles gpt-image-style models; Gemini via files). Model resolved from the Settings **image slot**.

| Transition | Prompt (catalog) | Input |
|---|---|---|
| `generate` brief→mockup | **`ui-mockup-generation`** (NEW) | brief text |
| `deconstruct` mockup→board | `ui-asset-deconstruction` (exists, spacing-hardened) | mockup image (+ brief) |
| `compose` board→mockup | **`ui-mockup-composition`** (NEW) | board image (+ brief) |

- **`ui-mockup-generation`** — brief → a full, clean UI page mockup (prototype). scenario `generation`, modality `image-generation`.
- **`ui-mockup-composition`** — asset board → a plausible UI page that arranges those assets. scenario `composition`.
- Result image → `importArtifact(targetNode, ...)` → node becomes `ready`; for `board`, this also feeds cutout.

## 7. Cutout transition (deterministic, reused)

`board→slices` = the existing worker pipeline. When `board` becomes ready, `useAutoRun` runs analysis; `BoardNode` shows params + preview, `SlicesNode` shows the grid. Zero algorithm change; the transition edge just visualizes it (running/done).

## 8. Semantic naming (`name` on the slices node)

After cutout, an optional step gives slices semantic filenames instead of `generated-sheet-01.png`:
- Send the **board image + each slice's bounding box** (or per-slice crops) to the **chat/理解 vision model** (Settings chat slot) via `generateText` with **structured output** (zod: `{ names: { index, name }[] }`).
- Apply names → `store.renameSlice`. Requires a vision-capable model in the chat slot; degrade with a toast/CTA if unset.
- New prompt `ui-slice-naming` (vision) in the catalog.

## 9. Import per node

Each node's `[导入…]` opens a file → `importArtifact(nodeId, ...)`. Importing a `board` = the old "导入素材图"; importing a `mockup` = bring your own screenshot. Both old tabs are now stage-scoped import actions.

## 10. File-tree additions

```
package.json                         # + @xyflow/react
src/components/canvas/**              # PipelineCanvas + nodes/ + edges/ + layout.ts
src/store/slices/pipeline.ts         # pipeline graph + runner
src/store/types.ts                   # extend Store with pipeline
src/prompts/catalog/{ui-mockup-generation, ui-mockup-composition, ui-slice-naming}.ts (+ index, tests)
src/services/ai/naming.ts            # vision → structured slice names
src/hooks/queries/pipeline.ts        # useRunTransition / useNameSlices mutations
src/components/AppShell.tsx          # WorkspaceLayout → PipelineCanvas
```
Retired: the two-tab `SourcePanel` mode logic, `GeneratePanel` (folded into `BriefNode`/`MockupNode`), `WorkspaceLayout` (→ canvas). `SourceCanvas`/`PreviewCanvas`/`SliceGrid`/`ParameterControls` are reused inside nodes.

## 11. Phased plan

- **P1 — Canvas skeleton, no regression.** Install `@xyflow/react`; `PipelineCanvas` with just **`board` + `slices`** nodes wrapping the existing preview/params/grid; import-board; replace `WorkspaceLayout`. Everything that works today works on the canvas. (De-risks the big swap first.)
- **P2 — Forward generation.** Add `brief` + `mockup` nodes; `ui-mockup-generation`; wire brief→mockup→board(deconstruct). Full forward chain on the canvas.
- **P3 — Bidirectional + naming.** `compose` (board→mockup); `ui-slice-naming` vision step.
- **P4 — Freeform & polish.** add-node, multiple mockups/boards, edge re-run, richer UX — enabled by the graph model.

## 12. Risks & mitigations

| # | Risk | Mitigation |
|---|---|---|
| 1 | Big-bang workspace swap regresses the working cutout | P1 wraps the EXISTING preview/params/grid in nodes first — no algorithm/store change; ship canvas before generation |
| 2 | React Flow ↔ React 19 peer | verify `@xyflow/react` v12 peer on install (supports 19); isolate in `PipelineCanvas` |
| 3 | Aesthetic regression (canvas looks gimmicky) | flat opaque bg, plain shadcn node cards, no neon/glass — per the project UI rule |
| 4 | Node UI perf (RF renders DOM nodes) | only a handful of stage nodes in V1 → non-issue; slices grid stays virtualized inside one node |
| 5 | Vision naming needs a vision model | gate on the chat slot; clear CTA when unset; naming is optional (fallback = numbered) |
| 6 | mockup vs board confusion (both images) | explicit stage badges + typed nodes + directed edges; downstream auto-clears on upstream change |
