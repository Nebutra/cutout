/**
 * Zustand store shape (spec §5).
 *
 * Zustand owns everything that is (a) synchronous and (b) never leaves the
 * process: the source bitmap, the four params, the analysis result (preview +
 * slices), and the selection. Anything crossing an I/O boundary (export, cloud
 * library, session) lives in TanStack Query instead.
 *
 * `ImageBitmap` is the transfer unit both ways — not `HTMLImageElement` or a
 * dataURL, which would bloat snapshots. `bitmap.close()` is called on every
 * superseded / replaced bitmap to guard against GPU leaks.
 */
import type { Box, CutoutParams } from '@/algorithm/types'
import type { GraphSpec } from '@/dag/graph-spec'
import type { IntentProfile } from '@/dag/intent-types'
import type { NodeRunState } from '@/dag/executor'
import type { CutoutSlice } from '@/services/types'
import type { SliceName } from '@/services/ai/naming'
import type { WorkspaceSnapshot } from '@/workspace/workspace-snapshot'

/** The four tunable parameters (defaults live in `slices/params.ts`). */
export type Params = CutoutParams

/** A parameter key — used by `setParam` for a type-safe partial update. */
export type ParamKey = keyof Params

/** The loaded source sheet. `bitmap` is null until an image is dropped. */
export interface SourceState {
  readonly bitmap: ImageBitmap | null
  /** Base filename without extension, e.g. `asset-sheet`. Used for slice names. */
  readonly name: string
  readonly width: number
  readonly height: number
  /** Stable id sent to the worker with every `loadImage` / `analyze`. */
  readonly imageId: string
}

/** Lifecycle status of the current analysis run. */
export type AnalysisStatus = 'idle' | 'running' | 'done' | 'error'

/** One exported slice as tracked in the store (UI-facing, owns an object URL). */
export interface Slice {
  readonly id: string
  readonly index: number
  /** Editable, sanitized filename ending in `.png`. */
  readonly name: string
  readonly box: Box
  readonly blob: Blob
  /** `URL.createObjectURL(blob)` — revoked on replacement / clear. */
  readonly objectUrl: string
  readonly width: number
  readonly height: number
  readonly selected: boolean
}

/**
 * The analysis result plus its bookkeeping.
 *
 * `runId` monotonically increases; a worker reply whose `runId` is not the
 * current one is stale and dropped (its bitmaps closed) — see `useAnalysisBridge`
 * and `applyAnalysisResult`.
 */
export interface AnalysisState {
  readonly status: AnalysisStatus
  readonly runId: number
  readonly error: string | null
  /** Center-pane preview bitmap; replaced (old one closed) on each preview. */
  readonly previewBitmap: ImageBitmap | null
  readonly slices: readonly Slice[]
}

/** A slice result payload as delivered by the worker bridge. */
export interface AnalysisResult {
  readonly slices: readonly SliceInput[]
}

/** Raw per-slice data from the worker, before it becomes a store {@link Slice}. */
export interface SliceInput {
  readonly id: string
  readonly index: number
  readonly box: Box
  readonly blob: Blob
  readonly width: number
  readonly height: number
}

/** A persisted project restore payload decoded back into live browser objects. */
export interface ProjectRestoreInput {
  readonly brief: string
  readonly params?: Params
  readonly intent?: IntentProfile | null
  readonly source?: {
    readonly bitmap: ImageBitmap
    readonly name: string
  }
  readonly mockup?: MockupArtifact | null
  readonly designMarkdown?: DesignMarkdownAsset | null
  readonly workspace?: WorkspaceSnapshot | null
  readonly slices?: ReadonlyArray<{
    readonly id: string
    readonly index: number
    readonly name: string
    readonly box: Box
    readonly blob: Blob
    readonly width: number
    readonly height: number
  }>
}

/**
 * Pipeline graph (spec §3–§4). The canvas renders this topology as nodes/edges.
 *
 * The graph holds only stage *identity* — which nodes exist and how they wire.
 * Live artifacts and status are NOT duplicated here: the `board` node's artifact
 * IS the existing {@link SourceState}, and the `slices` node's artifact IS the
 * existing {@link AnalysisState}. Status is therefore *derived* from those slices
 * (see `slices/pipeline.ts`), keeping a single source of truth. P2+ adds the
 * `brief`/`mockup` stages and a transition runner on top of this same shape.
 */
export type StageKind = 'brief' | 'mockup' | 'board' | 'slices'

/** Lifecycle status of a pipeline node (derived in P1). */
export type NodeStatus = 'empty' | 'ready' | 'running' | 'error'

/** A transition operation between two stages. */
export type Op = 'generate' | 'deconstruct' | 'compose' | 'cutout' | 'name'

/** One stage node in the pipeline graph. */
export interface PipelineNode {
  readonly id: string
  readonly kind: StageKind
}

/** A directed edge = a typed transition from one stage to the next. */
export interface PipelineTransition {
  readonly id: string
  readonly source: string
  readonly target: string
  readonly op: Op
}

/** The pipeline topology the canvas draws (positions live in the view, not here). */
export interface PipelineGraph {
  readonly nodes: readonly PipelineNode[]
  readonly transitions: readonly PipelineTransition[]
}

/**
 * The `mockup` node's artifact (spec §3/§4) — a generated/imported UI prototype
 * image. Unlike `board`/`slices` (whose artifacts ARE the existing source /
 * analysis), the P2 `brief`/`mockup` stages have no prior store backing, so
 * their artifacts live here. `bitmap` is kept for on-canvas display, `blob` is
 * the deconstruct input; `bitmap.close()` is called on every replacement.
 */
export interface MockupArtifact {
  readonly bitmap: ImageBitmap
  readonly blob: Blob
  readonly width: number
  readonly height: number
}

/** Imported DESIGN.md context that conditions prototype/design-system generation. */
export interface DesignMarkdownAsset {
  readonly name: string
  readonly content: string
  readonly importedAt: number
}

/**
 * Which generation is currently running (spec §6/§8). Only one AI step runs at a
 * time in the linear V1 chain, so a single phase drives both the relevant node's
 * spinner and the generation edges' running state. `composing` is the reverse
 * step (board → mockup); it lands in the `mockup` node like a forward generate.
 */
export type GenPhase =
  | 'idle'
  | 'generating-mockup'
  | 'deconstructing'
  | 'composing'

/** Which generation op an error is attributable to (drives the node error dot). */
export type GenOp = 'generate' | 'deconstruct' | 'compose'

/** The last generation failure, scoped to its op so the right node shows it. */
export interface GenError {
  readonly op: GenOp
  readonly message: string
}

/* --- Planned DAG (spec §5/§D + §6/§E) --------------------------------------
 *
 * When a requirement is PLANNED, the fixed linear chain is replaced by an
 * AI-emitted {@link GraphSpec} of arbitrary nodes. Each node's live status +
 * output live here (`dagNodes`), driven by the Executor via the sync actions
 * below. This is intentionally SEPARATE from the singleton `source`/`analysis`
 * that back the linear board→slices leg — the planned graph can fan out to many
 * mockups/boards, so its outputs cannot be the single cutout source.
 */

/** One planned node's produced artifact, keyed by kind so downstream reads it. */
export type DagNodeOutput =
  | { readonly kind: 'image'; readonly bytes: Uint8Array; readonly mediaType: string }
  | {
      readonly kind: 'slices'
      readonly slices: readonly CutoutSlice[]
      /** The board bytes the cut ran on (so a downstream `name` node can read it). */
      readonly boardBytes: Uint8Array
    }
  | { readonly kind: 'names'; readonly names: readonly SliceName[] }

/** A planned node's execution state (status + output/error), as the Executor sets it. */
export type DagNodeState = NodeRunState<DagNodeOutput>

/** Read-only state fields. */
export interface StoreState {
  readonly source: SourceState
  readonly params: Params
  readonly analysis: AnalysisState
  readonly pipeline: PipelineGraph
  /** The `brief` node's artifact — the free-text product requirement. */
  readonly brief: string
  /**
   * The recognized, open-world understanding of the current brief (spec §6/§7),
   * or null before recognition. Surfaced on the BriefNode; cleared when the
   * brief is edited (it becomes stale).
   */
  readonly intent: IntentProfile | null
  /** The `mockup` node's artifact (generated or imported), or null when empty. */
  readonly mockup: MockupArtifact | null
  /** Optional DESIGN.md source-of-truth imported from the ecosystem. */
  readonly designMarkdown: DesignMarkdownAsset | null
  /** Project-level planning/prototype UI state that must survive refresh/crash. */
  readonly workspaceSnapshot: WorkspaceSnapshot | null
  /** Which forward generation is in flight (drives mockup/edge running state). */
  readonly genPhase: GenPhase
  /** The last generation failure (op-scoped), or null. */
  readonly genError: GenError | null
  /** The planned graph (spec §6/§E), or null when the linear chain is shown. */
  readonly graph: GraphSpec | null
  /** Per-planned-node execution state, keyed by node id (empty in linear mode). */
  readonly dagNodes: Readonly<Record<string, DagNodeState>>
}

/** Actions (spec §5). All state updates are immutable. */
export interface StoreActions {
  /** Load a decoded bitmap as the new source, resetting analysis + selection. */
  loadImage(input: { bitmap: ImageBitmap; name: string }): void
  /** Update one param immutably (label update is instant; re-run is debounced). */
  setParam(key: ParamKey, value: number): void
  /** Reset all params to their defaults. */
  resetParams(): void
  /** Bump `runId`, mark `running`, and return the new id for the worker request. */
  beginAnalysis(): number
  /** Replace the preview bitmap for `runId`; drops (and closes) if stale. */
  applyPreview(runId: number, previewBitmap: ImageBitmap): void
  /** Commit slice results for `runId`; drops (and closes objectUrls) if stale. */
  applyAnalysisResult(runId: number, result: AnalysisResult): void
  /** Mark the current run as failed with a message (drops if stale). */
  failAnalysis(runId: number, message: string): void
  /** Select exactly one slice by id (clears others). */
  selectSlice(id: string): void
  /** Rename a slice (validated + sanitized + `.png`-suffixed). */
  renameSlice(id: string, name: string): void
  /** Clear the current selection. */
  clearSelection(): void
  /** Set the `brief` node's requirement text (clears any prior generate error + stale intent). */
  setBrief(text: string): void
  /** Record the recognized intent for the current brief (spec §6/§7). */
  setIntent(intent: IntentProfile): void
  /** Drop the recognized intent (e.g. after a reset). */
  clearIntent(): void
  /** Fill the `mockup` node (closing a superseded bitmap); marks it ready. */
  setMockup(artifact: MockupArtifact): void
  /** Set or replace the imported DESIGN.md context. */
  setDesignMarkdown(asset: DesignMarkdownAsset): void
  /** Clear the imported DESIGN.md context. */
  clearDesignMarkdown(): void
  /** Replace the project-level planning/prototype snapshot. */
  setWorkspaceSnapshot(snapshot: WorkspaceSnapshot | null): void
  /** Mark a forward generation as started (clears the prior error). */
  beginGen(phase: Exclude<GenPhase, 'idle'>): void
  /** Mark the current forward generation as finished (back to idle). */
  endGen(): void
  /** Mark the current forward generation as failed, scoped to its op. */
  failGen(op: GenOp, message: string): void
  /** Replace the linear chain with a planned graph; seeds every node `idle`. */
  setGraph(spec: GraphSpec): void
  /** Drop the planned graph and return to the linear chain (clears node states). */
  clearGraph(): void
  /** Apply one planned node's execution state (the Executor's `onStatus` sink). */
  setDagNodeState(id: string, state: DagNodeState): void
  /** Reset a set of planned nodes to `idle` (before an adjust-and-re-run). */
  resetDagNodes(ids: ReadonlySet<string>): void
  /** Start a clean local project, releasing current image / slice resources. */
  resetProject(): void
  /** Restore a persisted local project, rebuilding object URLs and live bitmaps. */
  restoreProject(input: ProjectRestoreInput): void
}

/** The full store: state + actions. */
export type Store = StoreState & StoreActions
