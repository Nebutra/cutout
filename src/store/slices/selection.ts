/**
 * Selection slice (spec §5 / §6).
 *
 * Selection is a per-slice `selected` flag on `analysis.slices` (single-select).
 * Rename is pure Zustand: validate non-empty, sanitize to mirror the Rust
 * writer, and ensure a `.png` suffix. No worker, no I/O.
 */
import { z } from 'zod'
import type { StateCreator } from 'zustand'
import { ensurePngName } from '@/lib/filename'
import type { Slice, Store } from '@/store/types'
import { approveProductionQualityIssues } from '@/asset-production'

/** A rename must be a non-empty (post-trim) string. */
const renameSchema = z.string().trim().min(1)

export interface SelectionSlice {
  selectSlice(id: string): void
  renameSlice(id: string, name: string): void
  updateSliceBounds(id: string, box: Slice['box']): void
  setSliceIncluded(id: string, included: boolean): void
  approveSliceForUse(id: string): boolean
  clearSelection(): void
}

/** Immutably set `selected` per slice against a predicate. */
function withSelection(
  slices: readonly Slice[],
  isSelected: (slice: Slice) => boolean,
): Slice[] {
  return slices.map((slice) => {
    const selected = isSelected(slice)
    return slice.selected === selected ? slice : { ...slice, selected }
  })
}

export const createSelectionSlice: StateCreator<
  Store,
  [],
  [],
  SelectionSlice
> = (set) => ({
  selectSlice: (id) =>
    set((state) => ({
      analysis: {
        ...state.analysis,
        slices: withSelection(state.analysis.slices, (s) => s.id === id),
      },
    })),

  clearSelection: () =>
    set((state) => ({
      analysis: {
        ...state.analysis,
        slices: withSelection(state.analysis.slices, () => false),
      },
    })),

  renameSlice: (id, name) => {
    const parsed = renameSchema.safeParse(name)
    if (!parsed.success) return
    const nextName = ensurePngName(parsed.data)
    set((state) => ({
      analysis: {
        ...state.analysis,
        slices: state.analysis.slices.map((slice) =>
          slice.id === id ? { ...slice, name: nextName } : slice,
        ),
      },
    }))
  },
  updateSliceBounds: (id, box) => {
    if (![box.x, box.y, box.width, box.height].every(Number.isFinite)) return
    if (box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0) return
    set((state) => ({
      analysis: {
        ...state.analysis,
        slices: state.analysis.slices.map((slice) =>
          slice.id === id ? { ...slice, box } : slice,
        ),
      },
    }))
  },
  setSliceIncluded: (id, included) =>
    set((state) => ({
      analysis: {
        ...state.analysis,
        slices: state.analysis.slices.map((slice) =>
          slice.id === id ? { ...slice, included } : slice,
        ),
      },
    })),
  approveSliceForUse: (id) => {
    let approved = false
    set((state) => {
      const slice = state.analysis.slices.find((candidate) => candidate.id === id)
      if (
        !slice?.productionRunId
        || !slice.productionTaskId
        || slice.readiness !== 'needs-review'
      ) return state
      try {
        const assetProduction = approveProductionQualityIssues({
          snapshot: state.assetProduction,
          runId: slice.productionRunId,
          taskId: slice.productionTaskId,
          actorId: 'local.user',
          receiptId: `asset-decision:${crypto.randomUUID()}`,
          at: Date.now(),
        })
        approved = true
        return {
          assetProduction,
          analysis: {
            ...state.analysis,
            slices: state.analysis.slices.map((candidate) =>
              candidate.id === id
                ? { ...candidate, readiness: 'waived' as const, included: true }
                : candidate,
            ),
          },
        }
      } catch {
        return state
      }
    })
    return approved
  },
})
