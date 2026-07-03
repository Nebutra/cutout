/**
 * Pipeline slice (spec §4) — the graph the canvas renders + the forward-chain
 * artifacts the P1 store did not already back.
 *
 * The full V1 chain is `brief → mockup → board → slices`:
 *   - `brief`  → free text typed into the node (`brief`)
 *   - `mockup` → a generated/imported UI prototype image (`mockup`)
 *   - `board`  ⇄ the cutout **source** (`store.source`)
 *   - `slices` ⇄ the cutout **analysis** (`store.analysis`)
 *
 * `board`/`slices` status stays *derived* from `source`/`analysis` (single source
 * of truth). `brief`/`mockup` have no prior backing, so their artifacts + the
 * forward-generation phase live here; their status is likewise derived from that
 * minimal state by the selectors below, so there is still no status field to
 * drift. The generation runner itself lives in `hooks/queries/pipeline.ts`.
 */
import type { StateCreator } from 'zustand'
import type {
  GenError,
  GenOp,
  GenPhase,
  MockupArtifact,
  NodeStatus,
  PipelineGraph,
  Store,
} from '@/store/types'

/** Stable node ids for the chain (also used to id each transition edge). */
export const BRIEF_NODE_ID = 'brief'
export const MOCKUP_NODE_ID = 'mockup'
export const BOARD_NODE_ID = 'board'
export const SLICES_NODE_ID = 'slices'

/** Stable transition edge ids (`source->target`). */
export const GENERATE_EDGE_ID = `${BRIEF_NODE_ID}->${MOCKUP_NODE_ID}`
export const DECONSTRUCT_EDGE_ID = `${MOCKUP_NODE_ID}->${BOARD_NODE_ID}`
export const CUTOUT_EDGE_ID = `${BOARD_NODE_ID}->${SLICES_NODE_ID}`

/** Display status of a transition edge (distinct from a node's {@link NodeStatus}). */
export type TransitionStatus = 'idle' | 'running' | 'done'

/** The full forward pipeline: brief → mockup → board → slices. */
export const INITIAL_PIPELINE: PipelineGraph = {
  nodes: [
    { id: BRIEF_NODE_ID, kind: 'brief' },
    { id: MOCKUP_NODE_ID, kind: 'mockup' },
    { id: BOARD_NODE_ID, kind: 'board' },
    { id: SLICES_NODE_ID, kind: 'slices' },
  ],
  transitions: [
    { id: GENERATE_EDGE_ID, source: BRIEF_NODE_ID, target: MOCKUP_NODE_ID, op: 'generate' },
    { id: DECONSTRUCT_EDGE_ID, source: MOCKUP_NODE_ID, target: BOARD_NODE_ID, op: 'deconstruct' },
    { id: CUTOUT_EDGE_ID, source: BOARD_NODE_ID, target: SLICES_NODE_ID, op: 'cutout' },
  ],
}

export interface PipelineSlice {
  pipeline: PipelineGraph
  brief: string
  mockup: MockupArtifact | null
  genPhase: GenPhase
  genError: GenError | null
  setBrief(text: string): void
  setMockup(artifact: MockupArtifact): void
  beginGen(phase: Exclude<GenPhase, 'idle'>): void
  endGen(): void
  failGen(op: GenOp, message: string): void
}

export const createPipelineSlice: StateCreator<Store, [], [], PipelineSlice> = (
  set,
) => ({
  pipeline: INITIAL_PIPELINE,
  brief: '',
  mockup: null,
  genPhase: 'idle',
  genError: null,

  setBrief: (text) =>
    set((s) => ({
      brief: text,
      // Editing the brief clears a stale generate error so the dot can recover.
      genError: s.genError?.op === 'generate' ? null : s.genError,
    })),

  setMockup: (artifact) =>
    set((s) => {
      // Close a superseded bitmap to guard against GPU leaks (store rule).
      if (s.mockup && s.mockup.bitmap !== artifact.bitmap) s.mockup.bitmap.close()
      return { mockup: artifact, genPhase: 'idle', genError: null }
    }),

  beginGen: (phase) => set({ genPhase: phase, genError: null }),

  endGen: () => set({ genPhase: 'idle' }),

  failGen: (op, message) => set({ genPhase: 'idle', genError: { op, message } }),
})

/* --- Derived status (single source of truth = artifacts above + source/analysis) --- */

/** `brief` is ready once the requirement has non-whitespace text. */
export const selectBriefStatus = (s: Store): NodeStatus =>
  s.brief.trim() ? 'ready' : 'empty'

/** `mockup` reflects its own generation: running / error / has-image. */
export const selectMockupStatus = (s: Store): NodeStatus => {
  if (s.genPhase === 'generating-mockup') return 'running'
  if (s.genError?.op === 'generate') return 'error'
  return s.mockup ? 'ready' : 'empty'
}

/** `board` is ready once a source sheet is loaded; running while deconstructing. */
export const selectBoardStatus = (s: Store): NodeStatus => {
  if (s.genPhase === 'deconstructing') return 'running'
  if (s.genError?.op === 'deconstruct') return 'error'
  return s.source.bitmap ? 'ready' : 'empty'
}

/** `slices` mirrors the analysis lifecycle (running / error / has-slices). */
export const selectSlicesStatus = (s: Store): NodeStatus => {
  const { status, slices } = s.analysis
  if (status === 'running') return 'running'
  if (status === 'error') return 'error'
  return slices.length > 0 ? 'ready' : 'empty'
}

/** The `brief→mockup` (`generate`) edge: idle → running → done. */
export const selectGenerateStatus = (s: Store): TransitionStatus => {
  if (s.genPhase === 'generating-mockup') return 'running'
  return s.mockup ? 'done' : 'idle'
}

/** The `mockup→board` (`deconstruct`) edge: idle → running → done. */
export const selectDeconstructStatus = (s: Store): TransitionStatus => {
  if (s.genPhase === 'deconstructing') return 'running'
  return s.source.bitmap ? 'done' : 'idle'
}

/** The `board→slices` (`cutout`) edge visualizes the same run: idle → running → done. */
export const selectCutoutStatus = (s: Store): TransitionStatus => {
  if (s.analysis.status === 'running') return 'running'
  return s.analysis.slices.length > 0 ? 'done' : 'idle'
}
