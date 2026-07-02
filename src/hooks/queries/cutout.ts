/**
 * Export mutations (spec §5 / §6).
 *
 * Export is async and can fail (disk error, user cancel), so it lives in a
 * TanStack Query mutation — `isPending`/`isError` replace the old manual
 * "导出中…" DOM juggling. The payload is snapshotted from the store at
 * mutate-time (not render-time), so an in-flight slider drag can't corrupt it.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getStoreState } from '@/store'
import { selectExportPayload, selectExportPayloadFor } from '@/store/selectors'
import { useServices } from '@/services/context'
import type {
  AssetRepository,
  AssetToSave,
  Result,
  SaveManyOutcome,
} from '@/services/types'
import { isErr } from '@/services/types'
import { rememberedDir, rememberLastDir } from '@/services/export-prefs.local'
import { assetKeys } from './keys'

/** Options accepted by both export mutations. */
export interface ExportOptions {
  readonly destDir?: string
}

/** Unwrap a service `Result`, throwing so the mutation enters its error state. */
function unwrap(result: Result<SaveManyOutcome>): SaveManyOutcome {
  if (isErr(result)) throw new Error(result.error)
  return result.data
}

/**
 * Run an export with the remembered-output-folder applied: an explicit
 * `opts.destDir` wins; otherwise the persisted remembered dir (when enabled) is
 * used, skipping the native picker. On a successful, non-canceled export the
 * chosen folder is remembered (a no-op unless remembering is on).
 */
async function runExport(
  assets: AssetRepository,
  payload: AssetToSave[],
  opts?: ExportOptions,
): Promise<SaveManyOutcome> {
  const destDir = opts?.destDir ?? (await rememberedDir())
  const outcome = unwrap(
    await assets.saveMany(payload, destDir ? { destDir } : undefined),
  )
  if (!outcome.canceled && outcome.outputDir) {
    await rememberLastDir(outcome.outputDir)
  }
  return outcome
}

/** Export every current slice. */
export function useExportAll() {
  const { assets } = useServices()
  const queryClient = useQueryClient()

  return useMutation<SaveManyOutcome, Error, ExportOptions | undefined>({
    mutationFn: (opts) =>
      runExport(assets, selectExportPayload(getStoreState()), opts),
    onSuccess: (outcome) => {
      if (!outcome.canceled) {
        void queryClient.invalidateQueries({ queryKey: assetKeys.all })
      }
    },
  })
}

/** Export a single slice by id. */
export function useExportOne() {
  const { assets } = useServices()
  const queryClient = useQueryClient()

  return useMutation<
    SaveManyOutcome,
    Error,
    { id: string; opts?: ExportOptions }
  >({
    mutationFn: ({ id, opts }) =>
      runExport(assets, selectExportPayloadFor(getStoreState(), id), opts),
    onSuccess: (outcome) => {
      if (!outcome.canceled) {
        void queryClient.invalidateQueries({ queryKey: assetKeys.all })
      }
    },
  })
}
