/**
 * Export orchestration with toast feedback (spec §6 step 6).
 *
 * Thin wrapper over the `useExportAll` / `useExportOne` mutations that turns a
 * `SaveManyOutcome` into user-facing Sonner toasts (partial success, cancel,
 * error) so every export entry point behaves identically. Components read
 * `isPending` off the returned mutations for their button states.
 */
import { useCallback } from 'react'
import { toast } from 'sonner'
import { useLingui } from '@lingui/react/macro'
import { plural } from '@lingui/core/macro'
import {
  useExportAll,
  useExportAllSvg,
  useExportOne,
  useExportOneSvg,
} from '@/hooks/queries/cutout'
import {
  useVectorizePrefs,
  vectorizePrefsOrDefault,
} from '@/hooks/queries/vectorize'
import type { SaveManyOutcome } from '@/services/types'

export interface ExportControls {
  readonly exportAllPending: boolean
  readonly exportOnePending: boolean
  readonly exportSvgPending: boolean
  exportAll(): void
  exportSvgLocal(): void
  exportSvgApi(): void
  exportPngAndSvgLocal(): void
  exportPngAndSvgApi(): void
  exportOne(id: string): void
  exportOneSvgLocal(id: string): void
  exportOneSvgApi(id: string): void
}

export function useExport(): ExportControls {
  const { t } = useLingui()
  const exportAllMutation = useExportAll()
  const exportAllSvgMutation = useExportAllSvg()
  const exportOneMutation = useExportOne()
  const exportOneSvgMutation = useExportOneSvg()
  const vectorizePrefs = useVectorizePrefs()

  /** Toast the result of a save (shared by all export buttons). */
  const reportOutcome = useCallback(
    (outcome: SaveManyOutcome): void => {
      if (outcome.canceled) return
      const savedCount = outcome.saved.length
      const failedCount = outcome.failed.length
      const where = outcome.outputDir ? ` → ${outcome.outputDir}` : ''

      if (savedCount === 0 && failedCount > 0) {
        const reason =
          outcome.failed[0]?.error ??
          t({ id: 'export.error_unknown', message: 'unknown error' })
        toast.error(
          t({ id: 'export.toast_failed', message: `Export failed: ${reason}` }),
        )
        return
      }
      if (failedCount > 0) {
        const total = savedCount + failedCount
        const summary = t({
          id: 'export.toast_partial',
          message: `Exported ${savedCount} of ${total}`,
        })
        toast.warning(`${summary}${where}`)
      } else {
        const summary = t({
          id: 'export.toast_success',
          message: plural(savedCount, {
            one: 'Exported # slice',
            other: 'Exported # slices',
          }),
        })
        toast.success(`${summary}${where}`)
      }
    },
    [t],
  )

  const exportAll = useCallback((): void => {
    exportAllMutation.mutate(undefined, {
      onSuccess: reportOutcome,
      onError: (error) => toast.error(error.message),
    })
  }, [exportAllMutation, reportOutcome])

  const exportSvgLocal = useCallback((): void => {
    exportAllSvgMutation.mutate(
      { route: 'local' },
      {
        onSuccess: reportOutcome,
        onError: (error) => toast.error(error.message),
      },
    )
  }, [exportAllSvgMutation, reportOutcome])

  const exportSvgApi = useCallback((): void => {
    const prefs = vectorizePrefsOrDefault(vectorizePrefs.data)
    exportAllSvgMutation.mutate(
      { route: 'api', apiId: prefs.apiId, apiMode: prefs.apiMode },
      {
        onSuccess: reportOutcome,
        onError: (error) => toast.error(error.message),
      },
    )
  }, [exportAllSvgMutation, reportOutcome, vectorizePrefs.data])

  const exportPngAndSvgLocal = useCallback((): void => {
    exportAllSvgMutation.mutate(
      { route: 'local', includePng: true },
      {
        onSuccess: reportOutcome,
        onError: (error) => toast.error(error.message),
      },
    )
  }, [exportAllSvgMutation, reportOutcome])

  const exportPngAndSvgApi = useCallback((): void => {
    const prefs = vectorizePrefsOrDefault(vectorizePrefs.data)
    exportAllSvgMutation.mutate(
      {
        route: 'api',
        apiId: prefs.apiId,
        apiMode: prefs.apiMode,
        includePng: true,
      },
      {
        onSuccess: reportOutcome,
        onError: (error) => toast.error(error.message),
      },
    )
  }, [exportAllSvgMutation, reportOutcome, vectorizePrefs.data])

  const exportOne = useCallback(
    (id: string): void => {
      exportOneMutation.mutate(
        { id },
        {
          onSuccess: reportOutcome,
          onError: (error) => toast.error(error.message),
        },
      )
    },
    [exportOneMutation, reportOutcome],
  )

  const exportOneSvgLocal = useCallback(
    (id: string): void => {
      exportOneSvgMutation.mutate(
        { id, opts: { route: 'local' } },
        {
          onSuccess: reportOutcome,
          onError: (error) => toast.error(error.message),
        },
      )
    },
    [exportOneSvgMutation, reportOutcome],
  )

  const exportOneSvgApi = useCallback(
    (id: string): void => {
      const prefs = vectorizePrefsOrDefault(vectorizePrefs.data)
      exportOneSvgMutation.mutate(
        {
          id,
          opts: { route: 'api', apiId: prefs.apiId, apiMode: prefs.apiMode },
        },
        {
          onSuccess: reportOutcome,
          onError: (error) => toast.error(error.message),
        },
      )
    },
    [exportOneSvgMutation, reportOutcome, vectorizePrefs.data],
  )

  return {
    exportAllPending: exportAllMutation.isPending,
    exportOnePending: exportOneMutation.isPending,
    exportSvgPending:
      exportAllSvgMutation.isPending || exportOneSvgMutation.isPending,
    exportAll,
    exportSvgLocal,
    exportSvgApi,
    exportPngAndSvgLocal,
    exportPngAndSvgApi,
    exportOne,
    exportOneSvgLocal,
    exportOneSvgApi,
  }
}
