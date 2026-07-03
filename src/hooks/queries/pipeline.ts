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
import type { PromptPart } from '@/prompts/types'
import { nameSlices, type SliceBox } from '@/services/ai/naming'
import { getStoreState, useStore } from '@/store'
import type { MockupArtifact } from '@/store/types'
import {
  decodeImage,
  bytesToBlob,
  blobToBytes,
  bitmapToBytes,
  isSupportedImage,
} from '@/lib/image'
import { useModelAssignments } from './ai-settings'

/** Decode a generated/imported image `Blob` into a {@link MockupArtifact}. */
async function toMockupArtifact(blob: Blob): Promise<MockupArtifact> {
  const bitmap = await decodeImage(blob)
  return { bitmap, blob, width: bitmap.width, height: bitmap.height }
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
      const image = assignments.data?.image
      if (!image) throw new Error('No image-generation model is configured.')

      const brief = getStoreState().brief.trim()
      if (!brief) throw new Error('Write a brief before generating.')

      const store = getStoreState()
      store.beginGen('generating-mockup')
      try {
        const result = await generation.generateImages({
          providerId: image.providerId,
          model: image.model,
          promptRef: { id: 'ui-mockup-generation' },
          input: [{ type: 'text', text: brief }],
        })
        if (isErr(result)) throw new Error(result.error)
        const asset = result.data[0]
        if (!asset) throw new Error('The model returned no image.')

        const blob = bytesToBlob(asset.bytes, asset.mediaType)
        store.setMockup(await toMockupArtifact(blob))
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
  const { generation } = useServices()
  const assignments = useModelAssignments()
  const loadImage = useStore((s) => s.loadImage)

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const image = assignments.data?.image
      if (!image) throw new Error('No image-generation model is configured.')

      const snapshot = getStoreState()
      const mockup = snapshot.mockup
      if (!mockup) throw new Error('Generate or import a mockup first.')

      const parts: PromptPart[] = []
      const brief = snapshot.brief.trim()
      if (brief) parts.push({ type: 'text', text: brief })
      parts.push({ type: 'image', image: await blobToBytes(mockup.blob) })

      snapshot.beginGen('deconstructing')
      try {
        const result = await generation.generateImages({
          providerId: image.providerId,
          model: image.model,
          promptRef: { id: 'ui-asset-deconstruction' },
          input: parts,
        })
        if (isErr(result)) throw new Error(result.error)
        const asset = result.data[0]
        if (!asset) throw new Error('The model returned no image.')

        // The board becomes the cutout source → auto-analysis follows (§7).
        const bitmap = await decodeImage(bytesToBlob(asset.bytes, asset.mediaType))
        loadImage({ bitmap, name: 'generated-sheet' })
        getStoreState().endGen()
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
