/**
 * Co-located selectors (spec §5).
 *
 * Array-returning selectors are meant to be consumed via `useShallow` in
 * components so a new array identity each render does not force re-renders.
 * `selectExportPayload` snapshots the current slices into the shape the export
 * mutation needs — taken at mutate-time so an in-flight drag can't mutate it.
 */
import { useShallow } from 'zustand/react/shallow'
import { useStore } from './index'
import type { Slice, SourceState, Store } from './types'
import type { AnalysisStatus } from './types'
import {
  currentProductionRunId,
  projectProductionReviewQueue,
  type ProductionReviewProjection,
} from '@/asset-production'

/** One asset ready to persist: filename + PNG blob. */
export interface ExportItem {
  readonly name: string
  readonly blob: Blob
}

export const selectSource = (s: Store): SourceState => s.source
export const selectStatus = (s: Store): AnalysisStatus => s.analysis.status
export const selectRunId = (s: Store): number => s.analysis.runId
export const selectError = (s: Store): string | null => s.analysis.error
export const selectPreviewBitmap = (s: Store): ImageBitmap | null =>
  s.analysis.previewBitmap

export function selectSlices(s: Store): readonly Slice[] {
  const currentRunId = currentProductionRunId(s.assetProduction)
  return s.analysis.slices.filter(
    (slice) => !slice.productionRunId || slice.productionRunId === currentRunId,
  )
}

/** The single selected slice, or null. */
export const selectSelectedSlice = (s: Store): Slice | null =>
  selectSlices(s).find((slice) => slice.selected) ?? null

/** True once at least one slice exists. */
export const selectHasSlices = (s: Store): boolean =>
  selectSlices(s).length > 0

/** Stable primitive subscription for effects that only need projected count. */
export const selectSliceCount = (s: Store): number =>
  selectSlices(s).length

export const selectProductionReviewQueue = (
  s: Store,
): readonly ProductionReviewProjection[] =>
  projectProductionReviewQueue(s.assetProduction)

export function isSliceConsumable(slice: Slice): boolean {
  return slice.readiness === null
    || slice.readiness === 'ready'
    || slice.readiness === 'waived'
    || slice.readiness === 'legacy-ready'
}

/** Snapshot of every slice as an export payload (default/renamed names applied). */
export function selectExportPayload(s: Store): ExportItem[] {
  return selectSlices(s)
    .filter((slice) => slice.included && isSliceConsumable(slice))
    .map((slice) => ({ name: slice.name, blob: slice.blob }))
}

/** Export payload for a single slice id (empty if not found). */
export function selectExportPayloadFor(s: Store, id: string): ExportItem[] {
  const slice = selectSlices(s).find((item) => item.id === id)
  return slice?.included && isSliceConsumable(slice)
    ? [{ name: slice.name, blob: slice.blob }]
    : []
}

/* --- Ready-made hooks (thin wrappers so components skip importing `useStore`) --- */

export const useSource = (): SourceState => useStore(selectSource)
export const useStatus = (): AnalysisStatus => useStore(selectStatus)
export const usePreviewBitmap = (): ImageBitmap | null =>
  useStore(selectPreviewBitmap)
export const useSelectedSlice = (): Slice | null =>
  useStore(selectSelectedSlice)
export const useSlices = (): readonly Slice[] =>
  useStore(useShallow(selectSlices))
export const useProductionReviewQueue = (): readonly ProductionReviewProjection[] =>
  useStore(useShallow(selectProductionReviewQueue))
