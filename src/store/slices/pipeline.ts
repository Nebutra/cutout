/**
 * Pipeline slice (spec §4) — the graph the canvas renders, kept minimal for P1.
 *
 * P1 models just the two existing stages already backed by the shipped store:
 *   - `board`  ⇄ the cutout **source** (`store.source`)
 *   - `slices` ⇄ the cutout **analysis** (`store.analysis`)
 * and the single `board→slices` (`cutout`) transition between them.
 *
 * The slice owns only the *topology* (which nodes exist + how they wire). Node
 * and edge **status** is derived from `source`/`analysis` by the selectors below
 * so there is a single source of truth — no status field to drift out of sync.
 * P2+ adds `brief`/`mockup` nodes and a transition runner onto this same shape.
 */
import type { StateCreator } from 'zustand'
import type { NodeStatus, PipelineGraph, Store } from '@/store/types'

/** Stable node ids for the P1 chain (also used to id the transition edge). */
export const BOARD_NODE_ID = 'board'
export const SLICES_NODE_ID = 'slices'
export const CUTOUT_EDGE_ID = `${BOARD_NODE_ID}->${SLICES_NODE_ID}`

/** Display status of a transition edge (distinct from a node's {@link NodeStatus}). */
export type TransitionStatus = 'idle' | 'running' | 'done'

/** The P1 pipeline: board → slices, wired by the deterministic `cutout` edge. */
export const INITIAL_PIPELINE: PipelineGraph = {
  nodes: [
    { id: BOARD_NODE_ID, kind: 'board' },
    { id: SLICES_NODE_ID, kind: 'slices' },
  ],
  transitions: [
    {
      id: CUTOUT_EDGE_ID,
      source: BOARD_NODE_ID,
      target: SLICES_NODE_ID,
      op: 'cutout',
    },
  ],
}

export interface PipelineSlice {
  pipeline: PipelineGraph
}

export const createPipelineSlice: StateCreator<Store, [], [], PipelineSlice> = () => ({
  pipeline: INITIAL_PIPELINE,
})

/* --- Derived status (single source of truth = source + analysis) --- */

/** `board` is ready once a source sheet is loaded, otherwise empty. */
export const selectBoardStatus = (s: Store): NodeStatus =>
  s.source.bitmap ? 'ready' : 'empty'

/** `slices` mirrors the analysis lifecycle (running / error / has-slices). */
export const selectSlicesStatus = (s: Store): NodeStatus => {
  const { status, slices } = s.analysis
  if (status === 'running') return 'running'
  if (status === 'error') return 'error'
  return slices.length > 0 ? 'ready' : 'empty'
}

/** The `board→slices` edge visualizes the same run: idle → running → done. */
export const selectCutoutStatus = (s: Store): TransitionStatus => {
  if (s.analysis.status === 'running') return 'running'
  return s.analysis.slices.length > 0 ? 'done' : 'idle'
}
