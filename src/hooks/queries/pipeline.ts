/**
 * Forward-generation runner (spec §6) — the mutations behind the canvas edges.
 *
 * Two BYOK image-generation transitions plus a plain import, all writing into
 * the pipeline slice so the nodes + edges derive their running/done/error state
 * from one source of truth:
 *   - `useGenerateMockup`    brief  → mockup  (`ui-mockup-generation`)
 *   - `useDeconstructMockup` mockup → board   (`ui-asset-deconstruction`)
 *   - `useImportMockup`      file   → mockup  (bring-your-own screenshot, §9)
 *
 * Both generations resolve the model from the Settings **image** slot and go
 * through `GenerationService.generateImages`; the key stays in Rust throughout.
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
import { getStoreState, useStore } from '@/store'
import type { MockupArtifact } from '@/store/types'
import {
  decodeImage,
  bytesToBlob,
  blobToBytes,
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
