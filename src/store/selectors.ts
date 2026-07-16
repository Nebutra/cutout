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
import type { Params, Slice, SourceState, Store } from './types'
import type { AnalysisStatus } from './types'

/** One asset ready to persist: filename + PNG blob. */
export interface ExportItem {
  readonly name: string
  readonly blob: Blob
}

export const selectSource = (s: Store): SourceState => s.source
export const selectParams = (s: Store): Params => s.params
export const selectStatus = (s: Store): AnalysisStatus => s.analysis.status
export const selectRunId = (s: Store): number => s.analysis.runId
export const selectError = (s: Store): string | null => s.analysis.error
export const selectPreviewBitmap = (s: Store): ImageBitmap | null =>
  s.analysis.previewBitmap

export const selectSlices = (s: Store): readonly Slice[] => s.analysis.slices

/** The single selected slice, or null. */
export const selectSelectedSlice = (s: Store): Slice | null =>
  s.analysis.slices.find((slice) => slice.selected) ?? null

/** True once at least one slice exists. */
export const selectHasSlices = (s: Store): boolean =>
  s.analysis.slices.length > 0

/** Snapshot of every slice as an export payload (default/renamed names applied). */
export function selectExportPayload(s: Store): ExportItem[] {
  return s.analysis.slices.filter((slice) => slice.included).map((slice) => ({ name: slice.name, blob: slice.blob }))
}

/** Export payload for a single slice id (empty if not found). */
export function selectExportPayloadFor(s: Store, id: string): ExportItem[] {
  const slice = s.analysis.slices.find((item) => item.id === id)
  return slice?.included ? [{ name: slice.name, blob: slice.blob }] : []
}

/* --- Ready-made hooks (thin wrappers so components skip importing `useStore`) --- */

export const useSource = (): SourceState => useStore(selectSource)
export const useParams = (): Params => useStore(selectParams)
export const useStatus = (): AnalysisStatus => useStore(selectStatus)
export const usePreviewBitmap = (): ImageBitmap | null =>
  useStore(selectPreviewBitmap)
export const useSelectedSlice = (): Slice | null =>
  useStore(selectSelectedSlice)
export const useSlices = (): readonly Slice[] =>
  useStore(useShallow(selectSlices))
