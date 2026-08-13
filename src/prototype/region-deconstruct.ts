/**
 * Per-region "breakdown-then-deconstruct" slicing.
 *
 * A whole-page board asks one image call to redraw an ENTIRE page as a single
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
import { computeBoardDiagnostics, type BoardDiagnostics } from '@/algorithm/boardDiagnostics'
import { runPipeline, type PipelineForegroundCoverage } from '@/algorithm/runPipeline'
import type { CutoutParams } from '@/algorithm/types'
import {
  bitmapToFrame,
  cropSlicePng,
  renderFrameCanvas,
} from '@/workers/render.worker-side'
import type { GenerationService } from '@/services/ai/types'
import type { ProviderService } from '@/services/ai/types'
import type { ModelAssignment } from '@/services/ai/model-assignment-types'
import type { ImageAdapterStrategy } from '@/services/ai/image-route-assessment'
import type { ReasoningEffort } from '@/services/ai/reasoning'
import { runWithTransientGenerationRetry } from '@/services/ai/generation-error'
import { nameSlices } from '@/services/ai/naming'
import { isErr } from '@/services/types'
import { buildBoardChecklist, generateWithQa, type QaVerdict } from './generation-qa'
import type { PrototypePage, PrototypeRegion } from './prototype-plan'
import type { SliceInput } from '@/store/types'
import { forEachConcurrent } from '@/lib/async-pool'

const DEFAULT_REGION_CONCURRENCY = 2
const DEFAULT_OPTIONAL_NAMING_TIMEOUT_MS = 30_000

async function runOptionalNaming<T>(input: {
  readonly parentSignal?: AbortSignal
  readonly timeoutMs: number
  readonly run: (signal: AbortSignal) => Promise<T>
}): Promise<T> {
  const controller = new AbortController()
  let rejectBoundary: (error: Error) => void = () => {}
  const boundary = new Promise<never>((_, reject) => {
    rejectBoundary = reject
  })
  const abort = (error: Error) => {
    if (controller.signal.aborted) return
    controller.abort(error)
    rejectBoundary(error)
  }
  const onParentAbort = () => abort(
    input.parentSignal?.reason instanceof Error
      ? input.parentSignal.reason
      : new DOMException('The operation was aborted.', 'AbortError'),
  )
  if (input.parentSignal?.aborted) onParentAbort()
  else input.parentSignal?.addEventListener('abort', onParentAbort, { once: true })
  const timer = setTimeout(
    () => abort(new Error('Optional slice naming exceeded its deadline.')),
    Math.max(1, input.timeoutMs),
  )
  const operation = Promise.resolve().then(() => input.run(controller.signal))
  try {
    return await Promise.race([operation, boundary])
  } finally {
    clearTimeout(timer)
    input.parentSignal?.removeEventListener('abort', onParentAbort)
    void operation.catch(() => undefined)
  }
}

/** A region eligible for board-cutout slicing, in the order it should stream. */
export function selectBoardCutoutRegions(
  page: PrototypePage,
): readonly PrototypeRegion[] {
  return page.regions.filter(
    (region) => region.assetRoute === 'board-cutout' && region.assetOpportunities.length > 0,
  )
}

/** Every page that owns at least one reusable board-cutout region. */
export function selectPagesWithBoardCutouts(
  pages: readonly PrototypePage[],
): readonly PrototypePage[] {
  return pages.filter((page) => selectBoardCutoutRegions(page).length > 0)
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

/**
 * The instruction that derives a TEXT-FREE extraction variant from a finished
 * page. The displayed page keeps its real copy (full perceived fidelity); this
 * variant replaces it only as the SOURCE for region asset boards, so no text
 * ever bleeds into cutout assets — the image-prototype equivalent of "text is
 * a runtime overlay, never baked into production art".
 */
export function pageTextFreeVariantPrompt(page: PrototypePage): string {
  return [
    `Reproduce the attached "${page.name}" page EXACTLY — same layout, same regions, same ` +
      `colors, materials, illustrations, icons, and components, pixel-faithful in style.`,
    `Change ONE thing only: remove ALL text. Replace every heading, label, number, and body ` +
      `line with a flat placeholder bar in the text color (rounded, matching the original ` +
      `text block's position and width). Buttons and badges keep their shape and fill but ` +
      `their captions become blank or a placeholder bar.`,
    `Do NOT restyle, recompose, add, or drop any visual element. No annotations, no frames.`,
  ].join('\n')
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
    `Do NOT include assets from any other region. Do NOT draw page chrome, containers, or backgrounds. ` +
      `Do NOT add any text labels, captions, numbering, or watermarks of your own.`,
    `Each declared item is exactly ONE independently reusable asset. Never turn one item into a ` +
      `collage, contact sheet, thumbnail strip, grid, nested card set, or adjacent variants. ` +
      `Remove UI presentation masks: no rounded card corners, circular crop, frame, border, or container shadow.`,
    `Do NOT bake any text into assets: no labels, headings, numerals, UI copy, or isolated ` +
      `glyphs — text is rendered at runtime, never as a cutout asset. Any white or very light ` +
      `asset must have a visible closed non-white contour, stroke, or internal contrast so the ` +
      `white-background cutout cannot fuse it with the canvas.`,
    regionBoardLayoutInstruction(region),
  ].join('\n')
}

/** Stable board layout contract shared with spatial task binding. */
export function regionBoardLayoutInstruction(region: PrototypeRegion): string {
  const assets = region.assetOpportunities.length > 0
    ? region.assetOpportunities
    : [region.name || region.role || 'region asset']
  const columns = Math.max(1, Math.ceil(Math.sqrt(assets.length)))
  const rows = Math.ceil(assets.length / columns)
  return [
    `Use an exact ${columns}-column by ${rows}-row grid. Fill cells in reading order, ` +
      `one complete asset per cell, and leave unused cells empty.`,
    `Cell ownership in reading order: ${assets.map((asset, index) => `${index + 1}=${asset}`).join('; ')}.`,
    `Keep every asset fully inside its own cell with white clearance from the cell boundaries. ` +
      `One cell contains one complete asset only; do not subdivide a cell. ` +
      `Do not add visible cell borders, labels, numbers, or guides.`,
  ].join(' ')
}

/**
 * Segment one generated region board into region/page-tagged slice inputs,
 * reusing the exact CV pipeline the worker runs. Also measures background
 * compliance from the PRISTINE frame (before `runPipeline` mutates its alpha)
 * so "did the model obey the pure-white instruction" is observable per board.
 * Main-thread OffscreenCanvas (as in `@/lib/image`); not covered by jsdom
 * unit tests.
 */
export async function sliceRegionBoardBitmap(
  bitmap: ImageBitmap,
  params: CutoutParams,
  regionId: string,
  pageId: string,
  signal?: AbortSignal,
): Promise<{
  slices: SliceInput[]
  diagnostics: BoardDiagnostics
  coverage: PipelineForegroundCoverage
}> {
  const frame = bitmapToFrame(bitmap)
  // Measure before runPipeline: it mutates the frame's alpha in place.
  const diagnostics = computeBoardDiagnostics(frame, params.threshold)
  const { boxes, coverage } = runPipeline(frame, params, signal)
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
  return { slices, diagnostics, coverage }
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

/** The exact Provider/model transport selected for one paid board attempt. */
export interface RegionImageRoute {
  readonly assignment: ModelAssignment
  readonly operation: 'image-edit' | 'image-generation'
  readonly transportStrategy?: ImageAdapterStrategy
}

function routeUsesMultimodalGeneration(route: RegionImageRoute): boolean {
  return route.operation === 'image-generation'
    || route.transportStrategy === 'google-multimodal-generate'
}

export interface RegionBreakdownDeps {
  readonly generation: {
    editImage: (
      input: Parameters<GenerationService['editImage']>[0],
      onAttemptAdmitted?: () => void,
    ) => ReturnType<GenerationService['editImage']>
    generateImages: (
      input: Parameters<GenerationService['generateImages']>[0],
      onAttemptAdmitted?: () => void,
    ) => ReturnType<GenerationService['generateImages']>
  }
  readonly providers: Pick<ProviderService, 'list'>
  /** Decode board bytes → bitmap (real: `decodeImage`; test: a stub). */
  readonly decode: (bytes: Uint8Array) => Promise<ImageBitmap>
  /**
   * Segment a region board bitmap → slices + background-compliance
   * diagnostics (real: `sliceRegionBoardBitmap`).
   */
  readonly slice: (
    bitmap: ImageBitmap,
    regionId: string,
    pageId: string,
    signal?: AbortSignal,
  ) => Promise<{
    slices: SliceInput[]
    diagnostics: BoardDiagnostics
    coverage: PipelineForegroundCoverage
  }>
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
  /**
   * Optional vision QA gate over each generated region board (real: wraps
   * `reviewGeneratedImage` with the chat/vision slot). When present, a
   * rejected board is regenerated with the failures appended as corrections
   * (bounded by `qaMaxRetries`); the final board ships either way. The fourth
   * argument is the exact route that produced the reviewed bytes, so callers
   * can share a Provider limiter without relying on a pre-retry route.
   */
  readonly reviewBoard?: (
    boardBytes: Uint8Array,
    checklist: readonly string[],
    signal: AbortSignal | undefined,
    generationRoute: RegionImageRoute,
  ) => Promise<QaVerdict>
}

export interface RegionBreakdownParams {
  readonly page: PrototypePage
  /** The generated page image, passed as the visual reference for every region board. */
  readonly pageBytes: Uint8Array
  /** Design-system + sibling-page bytes that anchor style across region boards. */
  readonly referenceImages?: readonly Uint8Array[]
  readonly image: ModelAssignment
  /** Exact model evidence intersected with an implemented edit adapter. */
  readonly editSupported?: boolean
  /**
   * Re-resolve the exact route immediately before every paid attempt. This is
   * intentionally attempt-scoped so transient and QA retries can leave a
   * pressured route without replaying the logical board node.
   */
  readonly resolveImageRoute?: () => RegionImageRoute
  readonly signal?: AbortSignal
  /** Streamed once per region as its slices are cut, so the UI fills in live. */
  readonly onRegionSliced: (
    regionId: string,
    slices: readonly SliceInput[],
    evidence: RegionSliceEvidence,
  ) => unknown
  /**
   * Streamed once per region as soon as its board's background-compliance
   * diagnostics exist (before `onRegionSliced`). Measurement only — a
   * non-compliant board still slices normally.
   */
  readonly onRegionDiagnostics?: (regionId: string, diagnostics: BoardDiagnostics) => void
  /**
   * Streamed when a region's names come back (after the slices are already
   * shown) — region-slug-namespaced so names reflect the page⊃region tree.
   */
  readonly onRegionNamed?: (renames: readonly { readonly id: string; readonly name: string }[]) => void
  /** Non-fatal per-region failure (one region's board/CV failed); the rest continue. */
  readonly onRegionError?: (regionId: string, message: string) => void
  /** Retry only these failed regions. Omit for a complete page breakdown. */
  readonly targetRegionIds?: readonly string[]
  /** Explicit paid QA retries per region board (only with `deps.reviewBoard`). Default 0. */
  readonly qaMaxRetries?: number
  /** Bounded retries for classified transient Provider transport failures. Default 1. */
  readonly transientRetries?: number
  /** Maximum region boards generated at once. Defaults to 2. */
  readonly regionConcurrency?: number
  /** Optional semantic naming budget. Naming never blocks required slice settlement. */
  readonly namingTimeoutMs?: number
  /**
   * Derive a text-free variant of the page first and use it as the source for
   * every region board (one extra image call per page; the DISPLAYED page
   * keeps its real copy). Falls back to the original page bytes on failure.
   */
  readonly textFreeSource?: boolean
  /** Non-fatal notice that the text-free variant failed and the original page was used. */
  readonly onTextFreeSourceError?: (message: string) => void
  /** Streamed once per QA attempt: regionId, attempt number, and its verdict. */
  readonly onRegionQa?: (regionId: string, attempt: number, verdict: QaVerdict) => void
  /** Records one paid generation attempt for this exact logical board node. */
  readonly onRegionGenerationAttempt?: (regionId: string) => void
}

export interface RegionSliceEvidence {
  readonly boardWidth: number
  readonly boardHeight: number
  readonly diagnostics: BoardDiagnostics
  readonly coverage: PipelineForegroundCoverage
  readonly qaVerdict: QaVerdict | null
  readonly generationRoute: RegionImageRoute
}

export interface RegionBreakdownResult {
  readonly regionCount: number
  readonly sliceCount: number
  readonly failedRegionIds: readonly string[]
  /** Background-compliance diagnostics per region board that sliced. */
  readonly diagnosticsByRegion: Readonly<Record<string, BoardDiagnostics>>
}

/**
 * Generate + slice each board-cutout region of a page, streaming slices out
 * per region. Provider routing (OpenAI edit vs generate) follows the shared
 * image route. A region whose board or CV fails is skipped (reported via
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
  const references = params.referenceImages ?? []
  const fallbackRoute: RegionImageRoute = {
    assignment: params.image,
    operation: params.editSupported === true ? 'image-edit' : 'image-generation',
  }
  const resolveImageRoute = () => params.resolveImageRoute?.() ?? fallbackRoute

  // Optionally swap the board source for a text-free variant of the page so
  // no text bleeds into cutout assets. Best-effort: the original page bytes
  // remain the fallback, and the displayed page artifact is never touched.
  let sourceBytes = params.pageBytes
  if (params.textFreeSource && regions.length > 0) {
    params.signal?.throwIfAborted()
    const variantPrompt = pageTextFreeVariantPrompt(params.page)
    try {
      const variant = await runWithTransientGenerationRetry({
        maxRetries: params.transientRetries ?? 1,
        signal: params.signal,
        run: () => {
          const route = resolveImageRoute()
          return routeUsesMultimodalGeneration(route)
            ? deps.generation.generateImages({
              providerId: route.assignment.providerId,
              model: route.assignment.model,
              system: variantPrompt,
              input: [
                { type: 'text', text: variantPrompt },
                { type: 'image', image: params.pageBytes },
              ],
              signal: params.signal,
            })
            : deps.generation.editImage({
              providerId: route.assignment.providerId,
              model: route.assignment.model,
              prompt: variantPrompt,
              images: [params.pageBytes],
              inputFidelity: 'high',
              signal: params.signal,
            })
        },
      })
      if (isErr(variant)) throw new Error(variant.error)
      const asset = variant.data[0]
      if (!asset) throw new Error('The model returned no text-free page variant.')
      sourceBytes = asset.bytes
    } catch (error) {
      if (params.signal?.aborted) throw error
      params.onTextFreeSourceError?.(
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  const failedRegionIds: string[] = []
  // Naming is a bounded, non-authoritative enhancement. Required board bytes,
  // slices, coverage, and task publication settle without waiting for it.
  const diagnosticsByRegion: Record<string, BoardDiagnostics> = {}
  let sliceCount = 0

  await forEachConcurrent(
    regions,
    params.regionConcurrency ?? DEFAULT_REGION_CONCURRENCY,
    async (region) => {
    params.signal?.throwIfAborted()
    const prompt = regionBoardPrompt(params.page, region)
    try {
      const generateBoard = async (
        boardPrompt: string,
        signal?: AbortSignal,
      ): Promise<Uint8Array> => {
        return runWithTransientGenerationRetry({
          maxRetries: params.transientRetries ?? 1,
          signal,
          run: async () => {
            const route = resolveImageRoute()
            const board = routeUsesMultimodalGeneration(route)
              ? await deps.generation.generateImages({
                  providerId: route.assignment.providerId,
                  model: route.assignment.model,
                  system: boardPrompt,
                  input: [
                    { type: 'text', text: boardPrompt },
                    { type: 'image', image: sourceBytes },
                    ...references.map((image) => ({ type: 'image' as const, image })),
                  ],
                  signal,
                }, () => params.onRegionGenerationAttempt?.(region.id))
              : await deps.generation.editImage({
                  providerId: route.assignment.providerId,
                  model: route.assignment.model,
                  prompt: boardPrompt,
                  images: [sourceBytes, ...references],
                  inputFidelity: 'high',
                  signal,
                }, () => params.onRegionGenerationAttempt?.(region.id))
            if (isErr(board)) throw new Error(board.error)
            const asset = board.data[0]
            if (!asset) throw new Error('The model returned no board image for this region.')
            successfulGenerationRoute = route
            return asset.bytes
          },
        })
      }

      let boardBytes: Uint8Array
      let qaVerdict: QaVerdict | null = null
      let successfulGenerationRoute: RegionImageRoute | null = null
      if (deps.reviewBoard) {
        const checklist = buildBoardChecklist(params.page, region)
        const reviewBoard = deps.reviewBoard
        const outcome = await generateWithQa({
          basePrompt: prompt,
          generate: generateBoard,
          review: (bytes, signal) => {
            if (!successfulGenerationRoute) {
              throw new Error('Board review has no successful image generation route.')
            }
            return reviewBoard(bytes, checklist, signal, successfulGenerationRoute)
          },
          maxRetries: params.qaMaxRetries,
          onVerdict: (attempt, verdict) => params.onRegionQa?.(region.id, attempt, verdict),
          signal: params.signal,
        })
        boardBytes = outcome.bytes
        qaVerdict = outcome.verdict
      } else {
        boardBytes = await generateBoard(prompt, params.signal)
      }
      let bitmap: ImageBitmap
      try {
        bitmap = await deps.decode(boardBytes)
      } catch (error) {
        throw new Error(
          `Board decode failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
      const boardWidth = bitmap.width
      const boardHeight = bitmap.height
      let slices: SliceInput[]
      let coverage!: PipelineForegroundCoverage
      try {
        const sliced = await deps.slice(bitmap, region.id, params.page.id, params.signal)
        slices = sliced.slices
        coverage = sliced.coverage
        if (slices.length === 0) {
          throw new Error('Board slicing produced zero candidates.')
        }
        diagnosticsByRegion[region.id] = sliced.diagnostics
        params.onRegionDiagnostics?.(region.id, sliced.diagnostics)
      } finally {
        // Release the decoded board surface promptly (the worker path closes
        // its bitmaps too); naming uses the board bytes, not the bitmap.
        bitmap.close()
      }
      sliceCount += slices.length
      await params.onRegionSliced(region.id, slices, {
        boardWidth,
        boardHeight,
        diagnostics: diagnosticsByRegion[region.id]!,
        coverage,
        qaVerdict,
        generationRoute: successfulGenerationRoute!,
      })

      if (deps.nameRegion && params.onRegionNamed && slices.length > 0) {
        const prefix = regionSlug(region.name)
        const nameRegion = deps.nameRegion
        void runOptionalNaming({
          parentSignal: params.signal,
          timeoutMs: params.namingTimeoutMs ?? DEFAULT_OPTIONAL_NAMING_TIMEOUT_MS,
          run: (signal) => nameRegion(boardBytes, slices, regionNameContext(region), signal),
        })
            .then((renames) => {
              const namespaced = renames.map((rename) => ({
                id: rename.id,
                name: `${prefix}-${rename.name}`,
              }))
              if (namespaced.length > 0) params.onRegionNamed?.(namespaced)
            })
            .catch((error) => {
              // Naming is best-effort. The bounded detached job owns and
              // observes its failure so required slice settlement is unchanged.
              if (params.signal?.aborted) return
              params.onRegionError?.(
                region.id,
                `naming: ${error instanceof Error ? error.message : String(error)}`,
              )
            })
      }
    } catch (error) {
      if (params.signal?.aborted) throw error
      const message = error instanceof Error ? error.message : String(error)
      failedRegionIds.push(region.id)
      params.onRegionError?.(region.id, message)
    }
    },
  )

  return { regionCount: regions.length, sliceCount, failedRegionIds, diagnosticsByRegion }
}
