/**
 * Generation runner (spec §6/§8) — the mutations behind the canvas edges + node
 * actions. All write into the pipeline slice so the nodes + edges derive their
 * running/done/error state from one source of truth:
 *   - `useGenerateMockup`    brief  → mockup  (`ui-mockup-generation`)
 *   - `useDeconstructMockup` mockup → board   (`ui-asset-deconstruction`)
 *   - `useComposeMockup`     board  → mockup  (`ui-mockup-composition`, reverse)
 *   - `useImportMockup`      file   → mockup  (bring-your-own screenshot, §9)
 *   - `useNameSlices`        board+boxes → slice names (vision, `ui-slice-naming`)
 *
 * The image transitions resolve the model from the Settings **image** slot and
 * go through `GenerationService.generateImages`; naming uses the **chat**
 * (understanding) slot and `generateObject`. The key stays in Rust throughout.
 * The board result reuses the existing `store.loadImage` → cutout auto-run, so
 * the `board→slices` pixel pipeline is untouched.
 */
import { useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useLingui } from '@lingui/react/macro'
import { useServices } from '@/services/context'
import { isErr } from '@/services/types'
import type { PromptPart, PromptService } from '@/prompts/types'
import { nameSlices, type SliceBox } from '@/services/ai/naming'
import { composeFromLibrary } from '@/services/ai/library-compose'
import type { ProviderConfig } from '@/services/ai/provider-types'
import { getStoreState, useStore } from '@/store'
import type { MockupArtifact } from '@/store/types'
import {
  decodeImage,
  bytesToBlob,
  blobToBytes,
  bitmapToBytes,
  isSupportedImage,
} from '@/lib/image'
import { logTiming, markTime } from '@/lib/timing'
import { useModelAssignments } from './ai-settings'

export interface DeconstructPreflight {
  readonly configs: readonly ProviderConfig[]
  readonly promptText: string
}

export interface DeconstructMockupInput {
  readonly preflight?: Promise<DeconstructPreflight> | DeconstructPreflight
  readonly referenceImages?: readonly Uint8Array[]
}

/** Decode a generated/imported image `Blob` into a {@link MockupArtifact}. */
async function toMockupArtifact(blob: Blob): Promise<MockupArtifact> {
  const bitmap = await decodeImage(blob)
  return { bitmap, blob, width: bitmap.width, height: bitmap.height }
}

/**
 * Render the `ui-asset-deconstruction` instruction to a plain prompt string for
 * the 垫图 (`editImage`) path, appending the brief when present. `editImage`
 * takes a rendered string (not a `promptRef`), so the managed prompt is resolved
 * here just like `generateImages` does internally for the `promptRef` path.
 */
async function deconstructPromptText(
  prompts: Pick<PromptService, 'render'>,
  brief: string,
  referenceCount = 1,
): Promise<string> {
  const rendered = await prompts.render({ id: 'ui-asset-deconstruction' })
  const referenceContext = deconstructReferenceContext(referenceCount)
  return [rendered.system, referenceContext, brief.trim()]
    .filter(Boolean)
    .join('\n\n')
}

/** Multimodal parts for the chat-image (Gemini) deconstruct path: brief + mockup. */
function buildDeconstructParts(
  brief: string,
  mockupBytes: Uint8Array,
  referenceImages: readonly Uint8Array[] = [],
): PromptPart[] {
  const parts: PromptPart[] = []
  const referenceContext = deconstructReferenceContext(1 + referenceImages.length)
  const text = [referenceContext, brief.trim()].filter(Boolean).join('\n\n')
  if (text) parts.push({ type: 'text', text })
  parts.push({ type: 'image', image: mockupBytes })
  for (const image of referenceImages) {
    parts.push({ type: 'image', image })
  }
  return parts
}

function deconstructReferenceContext(referenceCount: number): string {
  if (referenceCount <= 1) return ''
  return [
    `You receive ${referenceCount} prototype page references for one coherent suite.`,
    'Extract valuable assets from EVERY attached page, not only the first image.',
    'Keep the pages stylistically connected, but output a single asset library where each asset is atomic, isolated, complete, and not wrapped in UI chrome.',
  ].join('\n')
}

export function usePrepareDeconstructMockup() {
  const { providers, prompts } = useServices()

  return useCallback(
    async (brief: string, referenceCount = 1): Promise<DeconstructPreflight> => {
      const started = markTime()
      const [configs, promptText] = await Promise.all([
        providers.list(),
        deconstructPromptText(prompts, brief.trim(), referenceCount),
      ])
      logTiming('deconstruct.preflight.prepare', started)
      return { configs, promptText }
    },
    [prompts, providers],
  )
}

/**
 * Mutation: brief → generated UI mockup (`ui-mockup-generation`). The component
 * gates the call on an image model being assigned; the throw here is a safety
 * net. On success the `mockup` node becomes ready (image shown on the canvas).
 */
export function useGenerateMockup() {
  const { generation } = useServices()
  const assignments = useModelAssignments()

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const totalStarted = markTime()
      const image = assignments.data?.image
      if (!image) throw new Error('No image-generation model is configured.')

      const brief = getStoreState().brief.trim()
      if (!brief) throw new Error('Write a brief before generating.')

      const store = getStoreState()
      store.beginGen('generating-mockup')
      try {
        const apiStarted = markTime()
        const result = await generation.generateImages({
          providerId: image.providerId,
          model: image.model,
          promptRef: { id: 'ui-mockup-generation' },
          input: [{ type: 'text', text: brief }],
        })
        logTiming('mockup.generate.api', apiStarted)
        if (isErr(result)) throw new Error(result.error)
        const asset = result.data[0]
        if (!asset) throw new Error('The model returned no image.')

        const decodeStarted = markTime()
        const blob = bytesToBlob(asset.bytes, asset.mediaType)
        store.setMockup(await toMockupArtifact(blob))
        logTiming('mockup.decode', decodeStarted)
        logTiming('mockup.generate.total', totalStarted)
      } catch (error) {
        store.failGen('generate', error instanceof Error ? error.message : String(error))
        throw error
      }
    },
  })
}

/**
 * Mutation: the current mockup → a cutout-ready asset board
 * (`ui-asset-deconstruction`). The brief (if any) rides along as text framing.
 * The result loads as the cutout **source**, so the existing worker auto-run
 * fills the `board`/`slices` nodes unchanged.
 */
export function useDeconstructMockup() {
  const { generation, providers, prompts } = useServices()
  const assignments = useModelAssignments()
  const loadImage = useStore((s) => s.loadImage)

  return useMutation<void, Error, DeconstructMockupInput | void>({
    mutationFn: async (input) => {
      const totalStarted = markTime()
      const image = assignments.data?.image
      if (!image) throw new Error('No image-generation model is configured.')

      const snapshot = getStoreState()
      const mockup = snapshot.mockup
      if (!mockup) throw new Error('Generate or import a mockup first.')
      const referenceImages =
        input && 'referenceImages' in input && input.referenceImages
          ? input.referenceImages
          : []

      const brief = snapshot.brief.trim()
      snapshot.beginGen('deconstructing')

      // 垫图: when the image slot is an OpenAI-shaped provider, the upstream
      // mockup is a reference image the `/images/edits` endpoint conditions on
      // (the OpenAI images path can't carry an input image otherwise). Gemini &
      // other chat-image models keep the multimodal `generateImages` path, which
      // already sends the mockup as an image part.
      try {
        const preflightStarted = markTime()
        const preflight =
          input && 'preflight' in input && input.preflight
            ? Promise.resolve(input.preflight)
            : Promise.all([
                providers.list(),
                deconstructPromptText(prompts, brief, 1 + referenceImages.length),
              ]).then(([configs, promptText]) => ({ configs, promptText }))
        const [mockupBytes, resolvedPreflight] = await Promise.all([
          blobToBytes(mockup.blob),
          preflight,
        ])
        const { configs, promptText } = resolvedPreflight
        const kind = configs.find((p) => p.id === image.providerId)?.kind
        const useEdit = kind === 'openai' || kind === 'openai-compatible'
        logTiming('deconstruct.preflight', preflightStarted, {
          route: useEdit ? 'edit-image' : 'generate-image',
        })

        const apiStarted = markTime()
        const result = useEdit
          ? await generation.editImage({
              providerId: image.providerId,
              model: image.model,
              prompt: promptText,
              images: [mockupBytes, ...referenceImages],
              inputFidelity: 'high',
            })
          : await generation.generateImages({
              providerId: image.providerId,
              model: image.model,
              promptRef: { id: 'ui-asset-deconstruction' },
              input: buildDeconstructParts(brief, mockupBytes, referenceImages),
            })
        logTiming('deconstruct.api', apiStarted, {
          route: useEdit ? 'edit-image' : 'generate-image',
        })
        if (isErr(result)) throw new Error(result.error)
        const asset = result.data[0]
        if (!asset) throw new Error('The model returned no image.')

        // The board becomes the cutout source → auto-analysis follows (§7).
        const decodeStarted = markTime()
        const bitmap = await decodeImage(bytesToBlob(asset.bytes, asset.mediaType))
        loadImage({ bitmap, name: 'generated-sheet' })
        getStoreState().endGen()
        logTiming('deconstruct.decode-load', decodeStarted)
        logTiming('deconstruct.total', totalStarted)
      } catch (error) {
        getStoreState().failGen(
          'deconstruct',
          error instanceof Error ? error.message : String(error),
        )
        throw error
      }
    },
  })
}

/**
 * Mutation: the current board → a composed UI mockup (`ui-mockup-composition`,
 * spec §3/§6 reverse). The board is the cutout **source**, stored only as a
 * bitmap, so it is encoded to PNG bytes on the fly. The brief (if any) rides
 * along as text framing. The result lands in the `mockup` node like a forward
 * generate, closing the mockup ⇄ board loop; it does NOT touch the board/slices.
 */
export function useComposeMockup() {
  const { generation } = useServices()
  const assignments = useModelAssignments()

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const image = assignments.data?.image
      if (!image) throw new Error('No image-generation model is configured.')

      const snapshot = getStoreState()
      const board = snapshot.source.bitmap
      if (!board) throw new Error('Import or generate a board first.')

      const parts: PromptPart[] = []
      const brief = snapshot.brief.trim()
      if (brief) parts.push({ type: 'text', text: brief })
      parts.push({ type: 'image', image: await bitmapToBytes(board) })

      snapshot.beginGen('composing')
      try {
        const result = await generation.generateImages({
          providerId: image.providerId,
          model: image.model,
          promptRef: { id: 'ui-mockup-composition' },
          input: parts,
        })
        if (isErr(result)) throw new Error(result.error)
        const asset = result.data[0]
        if (!asset) throw new Error('The model returned no image.')

        const blob = bytesToBlob(asset.bytes, asset.mediaType)
        // `setMockup` clears the phase back to idle and closes any prior bitmap.
        getStoreState().setMockup(await toMockupArtifact(blob))
      } catch (error) {
        getStoreState().failGen(
          'compose',
          error instanceof Error ? error.message : String(error),
        )
        throw error
      }
    },
  })
}

/**
 * Mutation: selected library assets → a composed UI mockup
 * (`ui-mockup-composition`, spec §6/§7). The library counterpart to
 * {@link useComposeMockup}: it feeds each chosen asset's bytes as image parts
 * (the brief rides along as text framing) and lands the result in the `mockup`
 * node like a forward generate. Gated by the caller on an image model; the throw
 * is a safety net. The argument is the ordered list of selected asset ids.
 */
export function useComposeFromLibrary() {
  const { generation, assets } = useServices()
  const assignments = useModelAssignments()

  return useMutation<void, Error, readonly string[]>({
    mutationFn: async (assetIds) => {
      const image = assignments.data?.image
      if (!image) throw new Error('No image-generation model is configured.')
      if (assetIds.length === 0) {
        throw new Error('Select at least one asset to compose.')
      }

      const store = getStoreState()
      store.beginGen('composing')
      try {
        const result = await composeFromLibrary(
          { generation, load: assets.load },
          {
            providerId: image.providerId,
            model: image.model,
            assetIds,
            brief: store.brief,
          },
        )
        if (isErr(result)) throw new Error(result.error)

        const blob = bytesToBlob(result.data.bytes, result.data.mediaType)
        getStoreState().setMockup(await toMockupArtifact(blob))
      } catch (error) {
        getStoreState().failGen(
          'compose',
          error instanceof Error ? error.message : String(error),
        )
        throw error
      }
    },
  })
}

/**
 * Mutation: give the current slices semantic filenames (vision, spec §8). Sends
 * the board image + each slice's bounding box to the Settings **chat** vision
 * model and applies the returned names through the existing `store.renameSlice`
 * (which sanitizes + `.png`-suffixes). Optional — the component gates on a chat
 * model being assigned; the throw here is a safety net. Returns the count named.
 */
export function useNameSlices() {
  const { generation } = useServices()
  const assignments = useModelAssignments()

  return useMutation<number, Error, void>({
    mutationFn: async () => {
      const chat = assignments.data?.chat
      if (!chat) throw new Error('No chat/vision model is configured.')

      const snapshot = getStoreState()
      const board = snapshot.source.bitmap
      if (!board) throw new Error('There is no board image to read.')

      const slices = snapshot.analysis.slices
      if (slices.length === 0) throw new Error('There are no slices to name.')

      const boxes: SliceBox[] = slices.map((s) => ({ index: s.index, box: s.box }))
      const result = await nameSlices(generation, {
        providerId: chat.providerId,
        model: chat.model,
        imageBytes: await bitmapToBytes(board),
        slices: boxes,
        effort: chat.effort,
      })
      if (isErr(result)) throw new Error(result.error)

      // Map each answered index back onto its slice id, then rename in place.
      const idByIndex = new Map(slices.map((s) => [s.index, s.id]))
      const rename = getStoreState().renameSlice
      let named = 0
      for (const { index, name } of result.data) {
        const id = idByIndex.get(index)
        if (!id) continue
        rename(id, name)
        named += 1
      }
      if (named === 0) throw new Error('No slice names could be applied.')
      return named
    },
  })
}

/** Fill the `mockup` node from a picked/dropped file (bring-your-own, §9). */
export function useImportMockup() {
  const { t } = useLingui()
  const setMockup = useStore((s) => s.setMockup)

  return useCallback(
    async (file: File): Promise<void> => {
      if (!isSupportedImage(file)) {
        const name = file.name
        toast.error(
          t({ id: 'import.toast_unsupported', message: `Unsupported file: ${name}` }),
        )
        return
      }
      try {
        setMockup(await toMockupArtifact(file))
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t({ id: 'import.toast_load_failed', message: 'Could not load image' }),
        )
      }
    },
    [setMockup, t],
  )
}
