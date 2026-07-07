/**
 * Library reverse-composition (spec §6/§7) — re-assemble a hand-picked set of
 * library assets into ONE believable UI screen via `ui-mockup-composition`.
 *
 * This is the library counterpart to `useComposeMockup`: instead of one board
 * image, it feeds the bytes of every selected asset as image parts (plus the
 * brief as optional text framing) to `GenerationService.generateImages`. The
 * existing `ui-mockup-composition` system prompt is already written for exactly
 * this — "re-assembling a library of loose, standalone UI assets into a single
 * interface screen".
 *
 * Pure across the service seam: it loads assets through the injected `load`,
 * never throws, and returns a `Result` — the hook lands the asset in the mockup
 * node and surfaces failures.
 */
import type { PromptPart } from '@/prompts/types'
import type { AssetRepository, Result } from '@/services/types'
import { err, isErr, ok } from '@/services/types'
import { blobToBytes } from '@/lib/image'
import type { GeneratedAsset, GenerationService } from './types'

/** Cap on how many assets ride into one composition request. */
export const MAX_COMPOSE_ASSETS = 12

export interface ComposeFromLibraryDeps {
  readonly generation: Pick<GenerationService, 'generateImages'>
  readonly load: AssetRepository['load']
}

export interface ComposeFromLibraryParams {
  readonly providerId: string
  readonly model: string
  /** Ids of the library assets to compose (order preserved, capped). */
  readonly assetIds: readonly string[]
  /** Optional brief/instruction text framing the composition. */
  readonly brief?: string
  readonly signal?: AbortSignal
}

export async function composeFromLibrary(
  deps: ComposeFromLibraryDeps,
  params: ComposeFromLibraryParams,
): Promise<Result<GeneratedAsset>> {
  const ids = params.assetIds.slice(0, MAX_COMPOSE_ASSETS)
  if (ids.length === 0) return err<GeneratedAsset>('Select at least one asset to compose.')

  const parts: PromptPart[] = []
  const brief = params.brief?.trim()
  if (brief) parts.push({ type: 'text', text: brief })

  for (const id of ids) {
    const loaded = await deps.load(id)
    if (isErr(loaded)) return err<GeneratedAsset>(`Failed to load asset: ${loaded.error}`)
    parts.push({ type: 'image', image: await blobToBytes(loaded.data) })
  }

  const result = await deps.generation.generateImages({
    providerId: params.providerId,
    model: params.model,
    promptRef: { id: 'ui-mockup-composition' },
    input: parts,
    signal: params.signal,
  })
  if (isErr(result)) return result
  const asset = result.data[0]
  if (!asset) return err<GeneratedAsset>('The model returned no image.')
  return ok<GeneratedAsset>(asset)
}
