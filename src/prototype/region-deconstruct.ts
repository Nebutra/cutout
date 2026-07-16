/**
 * Per-region "breakdown-then-deconstruct" slicing.
 *
 * The legacy path asks one image call to redraw an ENTIRE page as a single
 * flat cutout board, then segments it once — so a dense page reliably drops
 * assets (an attention/coverage limit of one call redrawing dozens of
 * elements) and the CV flood-fill has to separate everything at once.
 *
 * This module instead loops over a page's `board-cutout` regions, generates a
 * SCOPED board per region (each call redraws only that region's few assets, so
 * far fewer drops), runs the SAME CV pipeline per region board, tags each
 * resulting slice with its region + page (the reversible page⊃region⊃slice
 * tree), and streams each region's slices out as it finishes.
 *
 * Orchestration (region selection, scoped prompts, streaming) is pure and
 * dependency-injected so it unit-tests without real image generation or a
 * canvas. The concrete CV slicing (`sliceRegionBoardBitmap`) touches
 * OffscreenCanvas, so it is exercised by the gated pipeline E2E and the
 * `src/algorithm` suite, not jsdom unit tests.
 */
import { runPipeline } from '@/algorithm/runPipeline'
import type { CutoutParams } from '@/algorithm/types'
import {
  bitmapToFrame,
  cropSlicePng,
  renderFrameCanvas,
} from '@/workers/render.worker-side'
import type { GenerationService } from '@/services/ai/types'
import type { ProviderService } from '@/services/ai/types'
import type { ModelAssignment } from '@/services/ai/model-assignment-types'
import type { ReasoningEffort } from '@/services/ai/reasoning'
import { nameSlices } from '@/services/ai/naming'
import { isErr } from '@/services/types'
import type { PrototypePage, PrototypeRegion } from './prototype-plan'
import type { SliceInput } from '@/store/types'

/** A region eligible for board-cutout slicing, in the order it should stream. */
export function selectBoardCutoutRegions(
  page: PrototypePage,
): readonly PrototypeRegion[] {
  return page.regions.filter((region) => region.assetRoute === 'board-cutout')
}

/** A file-safe slug from a region name, for namespacing slice names by region. */
export function regionSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'region'
  )
}

/** Semantic grounding fed to the naming vision call so names are on-domain. */
export function regionNameContext(region: PrototypeRegion): string {
  const assets =
    region.assetOpportunities.length > 0
      ? ` Expected asset types: ${region.assetOpportunities.join(', ')}.`
      : ''
  return (
    `These assets were cut from the "${region.name}" region (${region.role}) of a UI page: ` +
    `${region.summary}.${assets} Name each box as the specific UI asset it shows.`
  )
}

/** The scoped board-generation instruction for a single region. */
export function regionBoardPrompt(page: PrototypePage, region: PrototypeRegion): string {
  const assets =
    region.assetOpportunities.length > 0
      ? ` Focus assets: ${region.assetOpportunities.join(', ')}.`
      : ''
  return [
    `From the attached page design, extract ONLY the visual assets that belong to the ` +
      `"${region.name}" region (${region.role}) of the "${page.name}" page: ${region.summary}.${assets}`,
    `Redraw each asset as a clean, isolated element on a SINGLE flat, pure-white (#FFFFFF) ` +
      `background. Pure white must fully surround every asset and flow continuously between ` +
      `all of them, with at least 64px of clear margin. Assets must NEVER touch, overlap, ` +
      `connect, or share a bounding box — an automatic white-background cutout separates them.`,
    `Do NOT include assets from any other region. Do NOT draw page chrome, containers, or backgrounds.`,
  ].join('\n')
}

/**
 * Segment one generated region board into region/page-tagged slice inputs,
 * reusing the exact CV pipeline the worker runs. Main-thread OffscreenCanvas
 * (as in `@/lib/image`); not covered by jsdom unit tests.
 */
export async function sliceRegionBoardBitmap(
  bitmap: ImageBitmap,
  params: CutoutParams,
  regionId: string,
  pageId: string,
  signal?: AbortSignal,
): Promise<SliceInput[]> {
  const frame = bitmapToFrame(bitmap)
  const { boxes } = runPipeline(frame, params, signal)
  const cropSource = renderFrameCanvas(frame)
  const slices: SliceInput[] = []
  for (const [index, box] of boxes.entries()) {
    signal?.throwIfAborted()
    const blob = await cropSlicePng(cropSource, box)
    slices.push({
      id: crypto.randomUUID(),
      index,
      box,
      blob,
      width: box.width,
      height: box.height,
      regionId,
      pageId,
    })
  }
  return slices
}

/**
 * Concrete `nameRegion` adapter: one region-primed vision call over the region
 * board + its boxes, mapping the model's per-index names back to slice ids.
 * The board index is the region-local index `sliceRegionBoardBitmap` assigned;
 * the slice `id` is stable across the store's global re-indexing, so renaming
 * by id stays correct.
 */
export async function nameRegionSlices(
  generation: GenerationService,
  chat: { readonly providerId: string; readonly model: string; readonly effort?: ReasoningEffort },
  boardBytes: Uint8Array,
  slices: readonly SliceInput[],
  context: string,
  signal?: AbortSignal,
): Promise<readonly { readonly id: string; readonly name: string }[]> {
  const result = await nameSlices(generation, {
    providerId: chat.providerId,
    model: chat.model,
    imageBytes: boardBytes,
    slices: slices.map((slice) => ({ index: slice.index, box: slice.box })),
    context,
    effort: chat.effort,
    signal,
  })
  if (isErr(result)) throw new Error(result.error)
  const idByIndex = new Map(slices.map((slice) => [slice.index, slice.id]))
  const renames: { id: string; name: string }[] = []
  for (const { index, name } of result.data) {
    const id = idByIndex.get(index)
    if (id) renames.push({ id, name })
  }
  return renames
}

export interface RegionBreakdownDeps {
  readonly generation: Pick<GenerationService, 'editImage' | 'generateImages'>
  readonly providers: Pick<ProviderService, 'list'>
  /** Decode board bytes → bitmap (real: `decodeImage`; test: a stub). */
  readonly decode: (bytes: Uint8Array) => Promise<ImageBitmap>
  /** Segment a region board bitmap → slices (real: `sliceRegionBoardBitmap`). */
  readonly slice: (
    bitmap: ImageBitmap,
    regionId: string,
    pageId: string,
    signal?: AbortSignal,
  ) => Promise<SliceInput[]>
  /**
   * Optional: name one region's slices in a single region-primed vision call
   * (real: wraps `nameSlices` with `regionNameContext`). Returns `{id,name}`
   * per slice. Omitted → slices keep their placeholder names.
   */
  readonly nameRegion?: (
    boardBytes: Uint8Array,
    slices: readonly SliceInput[],
    context: string,
    signal?: AbortSignal,
  ) => Promise<readonly { readonly id: string; readonly name: string }[]>
}

export interface RegionBreakdownParams {
  readonly page: PrototypePage
  /** The generated page image, passed as the visual reference for every region board. */
  readonly pageBytes: Uint8Array
  /** Design-system + sibling-page bytes that anchor style across region boards. */
  readonly referenceImages?: readonly Uint8Array[]
  readonly image: ModelAssignment
  readonly signal?: AbortSignal
  /** Streamed once per region as its slices are cut, so the UI fills in live. */
  readonly onRegionSliced: (regionId: string, slices: readonly SliceInput[]) => void
  /**
   * Streamed when a region's names come back (after the slices are already
   * shown) — region-slug-namespaced so names reflect the page⊃region tree.
   */
  readonly onRegionNamed?: (renames: readonly { readonly id: string; readonly name: string }[]) => void
  /** Non-fatal per-region failure (one region's board/CV failed); the rest continue. */
  readonly onRegionError?: (regionId: string, message: string) => void
  /** Retry only these failed regions. Omit for a complete page breakdown. */
  readonly targetRegionIds?: readonly string[]
}

export interface RegionBreakdownResult {
  readonly regionCount: number
  readonly sliceCount: number
  readonly failedRegionIds: readonly string[]
}

/**
 * Generate + slice each board-cutout region of a page, streaming slices out
 * per region. Provider routing (openai edit vs generate) mirrors the legacy
 * whole-page path. A region whose board or CV fails is skipped (reported via
 * `onRegionError`) rather than aborting the whole page.
 */
export async function runRegionBreakdown(
  deps: RegionBreakdownDeps,
  params: RegionBreakdownParams,
): Promise<RegionBreakdownResult> {
  const targets = params.targetRegionIds ? new Set(params.targetRegionIds) : null
  const regions = selectBoardCutoutRegions(params.page).filter(
    (region) => !targets || targets.has(region.id),
  )
  const configs = await deps.providers.list()
  const kind = configs.find((provider) => provider.id === params.image.providerId)?.kind
  const useEdit = kind === 'openai' || kind === 'openai-compatible'
  const references = params.referenceImages ?? []

  const failedRegionIds: string[] = []
  // Naming runs concurrently with the NEXT region's board generation (a region-
  // primed vision call), then applied once resolved — so slices show instantly
  // and names fill in without serializing behind every region's generation.
  const namingJobs: Promise<void>[] = []
  let sliceCount = 0

  for (const region of regions) {
    params.signal?.throwIfAborted()
    const prompt = regionBoardPrompt(params.page, region)
    try {
      const board = useEdit
        ? await deps.generation.editImage({
            providerId: params.image.providerId,
            model: params.image.model,
            prompt,
            images: [params.pageBytes, ...references],
            inputFidelity: 'high',
            signal: params.signal,
          })
        : await deps.generation.generateImages({
            providerId: params.image.providerId,
            model: params.image.model,
            // Chat-image (Gemini) path can't take a reference via `images`;
            // carry the page + references as multimodal input parts instead.
            system: prompt,
            input: [
              { type: 'text', text: prompt },
              { type: 'image', image: params.pageBytes },
              ...references.map((image) => ({ type: 'image' as const, image })),
            ],
            signal: params.signal,
          })
      if (isErr(board)) throw new Error(board.error)
      const asset = board.data[0]
      if (!asset) throw new Error('The model returned no board image for this region.')
      const bitmap = await deps.decode(asset.bytes)
      let slices: SliceInput[]
      try {
        slices = await deps.slice(bitmap, region.id, params.page.id, params.signal)
      } finally {
        // Release the decoded board surface promptly (the worker path closes
        // its bitmaps too); naming uses asset.bytes, not the bitmap.
        bitmap.close()
      }
      sliceCount += slices.length
      params.onRegionSliced(region.id, slices)

      if (deps.nameRegion && params.onRegionNamed && slices.length > 0) {
        const boardBytes = asset.bytes
        const prefix = regionSlug(region.name)
        namingJobs.push(
          deps
            .nameRegion(boardBytes, slices, regionNameContext(region), params.signal)
            .then((renames) => {
              const namespaced = renames.map((rename) => ({
                id: rename.id,
                name: `${prefix}-${rename.name}`,
              }))
              if (namespaced.length > 0) params.onRegionNamed?.(namespaced)
            })
            .catch((error) => {
              // Naming is best-effort. On abort the whole run is being torn
              // down — swallow it so this job never rejects (a re-throw here
              // would orphan the promise if the main loop's abort skips the
              // Promise.all below, surfacing as an unhandled rejection).
              if (params.signal?.aborted) return
              params.onRegionError?.(
                region.id,
                `naming: ${error instanceof Error ? error.message : String(error)}`,
              )
            }),
        )
      }
    } catch (error) {
      if (params.signal?.aborted) throw error
      const message = error instanceof Error ? error.message : String(error)
      failedRegionIds.push(region.id)
      params.onRegionError?.(region.id, message)
    }
  }

  await Promise.all(namingJobs)
  return { regionCount: regions.length, sliceCount, failedRegionIds }
}
