/**
 * Generate a cutout-ready asset sheet from a proto (UI screenshot).
 *
 * Closes the AI-native front half of the chain: proto (+ optional brief) →
 * `ui-asset-deconstruction` system prompt → image model → a regenerated "UI
 * Asset Sheet" → loaded as the cutout SOURCE (so it flows straight into the
 * existing slice → export pipeline). The model is resolved from the Settings
 * "image generation" slot; the key stays in Rust (BYOK proxy) throughout.
 */
import { useMutation } from '@tanstack/react-query'
import { useServices } from '@/services/context'
import { isErr } from '@/services/types'
import type { GeneratedAsset } from '@/services/ai/types'
import type { PromptPart } from '@/prompts/types'
import { useStore } from '@/store'
import { decodeImage, bytesToBlob } from '@/lib/image'
import { useModelAssignments } from './ai-settings'

export interface GenerateFromProtoInput {
  /** Raw bytes of the proto screenshot. */
  readonly bytes: Uint8Array
  /** IANA media type of the proto (e.g. `image/png`). */
  readonly mediaType: string
  /** Optional brief prepended as a text part (what to emphasize). */
  readonly requirement?: string
}

/**
 * Mutation: proto → generated asset sheet → cutout source. The component gates
 * the call on an image model being assigned; the throw here is a safety net.
 */
export function useGenerateFromProto() {
  const { generation } = useServices()
  const assignments = useModelAssignments()
  const loadImage = useStore((s) => s.loadImage)

  return useMutation<GeneratedAsset, Error, GenerateFromProtoInput>({
    mutationFn: async ({ bytes, mediaType, requirement }) => {
      const image = assignments.data?.image
      if (!image) {
        throw new Error('No image-generation model is configured.')
      }

      const parts: PromptPart[] = []
      const brief = requirement?.trim()
      if (brief) parts.push({ type: 'text', text: brief })
      parts.push({ type: 'image', image: bytes })

      const result = await generation.generateImages({
        providerId: image.providerId,
        model: image.model,
        promptRef: { id: 'ui-asset-deconstruction' },
        input: parts,
      })
      if (isErr(result)) throw new Error(result.error)

      const asset = result.data[0]
      if (!asset) throw new Error('The model returned no image.')

      // The generated sheet becomes the cutout source → auto-analysis follows.
      const bitmap = await decodeImage(bytesToBlob(asset.bytes, asset.mediaType))
      // `mediaType` is validated by decode; kept for callers that inspect it.
      void mediaType
      loadImage({ bitmap, name: 'generated-sheet' })
      return asset
    },
  })
}
