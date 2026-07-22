/**
 * Export mutations (spec §5 / §6).
 *
 * Export is async and can fail (disk error, user cancel), so it lives in a
 * TanStack Query mutation — `isPending`/`isError` replace the old manual
 * "导出中…" DOM juggling. The payload is snapshotted from the store at
 * mutate-time (not render-time), so later store changes can't corrupt it.
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
  SvgVectorizerRoute,
} from '@/services/types'
import { isErr, isOk } from '@/services/types'
import type { VectorizerAiMode } from '@/platform/native'
import { rememberedDir, rememberLastDir } from '@/services/export-prefs.local'
import { ensureSvgName } from '@/lib/filename'
import { assetKeys } from './keys'

/** Options accepted by both export mutations. */
export interface ExportOptions {
  readonly destDir?: string
}

export interface ExportSvgOptions extends ExportOptions {
  readonly route: SvgVectorizerRoute
  readonly apiId?: string
  readonly apiMode?: VectorizerAiMode
  readonly includePng?: boolean
}

interface VectorizeBatchResult {
  readonly assets: readonly AssetToSave[]
  readonly failed: readonly { name: string; error: string }[]
}

const LOCAL_VECTORIZE_CONCURRENCY = 4
const API_VECTORIZE_CONCURRENCY = 2

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

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const workerCount = Math.min(concurrency, items.length)
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (next < items.length) {
        const index = next
        next += 1
        out[index] = await run(items[index], index)
      }
    }),
  )
  return out
}

function mergeOutcomes(
  outcome: SaveManyOutcome,
  failed: readonly { name: string; error: string }[],
): SaveManyOutcome {
  if (failed.length === 0) return outcome
  return {
    ...outcome,
    failed: [...outcome.failed, ...failed],
  }
}

function failedOnly(
  failed: readonly { name: string; error: string }[],
): SaveManyOutcome {
  return {
    saved: [],
    failed,
    outputDir: null,
    canceled: false,
  }
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

/** Export every current slice as SVG, optionally with the original PNGs. */
export function useExportAllSvg() {
  const { assets, vectorize } = useServices()
  const queryClient = useQueryClient()

  return useMutation<SaveManyOutcome, Error, ExportSvgOptions>({
    mutationFn: async (opts) => {
      const pngPayload: AssetToSave[] = selectExportPayload(getStoreState())
      if (pngPayload.length === 0) {
        throw new Error('Nothing to export')
      }

      const svg = await vectorizeBatch(vectorize, pngPayload, opts)
      const payload = opts.includePng
        ? [...pngPayload, ...svg.assets]
        : [...svg.assets]

      if (payload.length === 0) return failedOnly(svg.failed)
      return mergeOutcomes(await runExport(assets, payload, opts), svg.failed)
    },
    onSuccess: (outcome) => {
      if (!outcome.canceled) {
        void queryClient.invalidateQueries({ queryKey: assetKeys.all })
      }
    },
  })
}

/** Export one current slice as SVG, optionally with the original PNG. */
export function useExportOneSvg() {
  const { assets, vectorize } = useServices()
  const queryClient = useQueryClient()

  return useMutation<
    SaveManyOutcome,
    Error,
    { id: string; opts: ExportSvgOptions }
  >({
    mutationFn: async ({ id, opts }) => {
      const pngPayload: AssetToSave[] = selectExportPayloadFor(
        getStoreState(),
        id,
      )
      if (pngPayload.length === 0) {
        throw new Error('Slice not found')
      }

      const svg = await vectorizeBatch(vectorize, pngPayload, opts)
      const payload = opts.includePng
        ? [...pngPayload, ...svg.assets]
        : [...svg.assets]

      if (payload.length === 0) return failedOnly(svg.failed)
      return mergeOutcomes(await runExport(assets, payload, opts), svg.failed)
    },
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

async function vectorizeBatch(
  vectorize: ReturnType<typeof useServices>['vectorize'],
  payload: readonly AssetToSave[],
  opts: ExportSvgOptions,
): Promise<VectorizeBatchResult> {
  if (opts.route === 'api' && !opts.apiId?.trim()) {
    throw new Error('Configure Vectorizer.AI API Id first')
  }

  const concurrency =
    opts.route === 'api' ? API_VECTORIZE_CONCURRENCY : LOCAL_VECTORIZE_CONCURRENCY
  const rows = await mapWithConcurrency(payload, concurrency, async (asset) => {
    const result = await vectorize.vectorize({
      asset,
      route: opts.route,
      apiId: opts.apiId,
      apiMode: opts.apiMode,
    })
    return isOk(result)
      ? { asset: result.data, failed: null }
      : {
          asset: null,
          failed: { name: ensureSvgName(asset.name), error: result.error },
        }
  })

  return {
    assets: rows.flatMap((row) => (row.asset ? [row.asset] : [])),
    failed: rows.flatMap((row) => (row.failed ? [row.failed] : [])),
  }
}
