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
  /** Raw bytes of the proto screenshot (optional — a text brief alone works). */
  readonly bytes?: Uint8Array
  /** IANA media type of the proto (e.g. `image/png`). */
  readonly mediaType?: string
  /** Brief prepended as a text part; required when no screenshot is given. */
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
    mutationFn: async ({ bytes, requirement }) => {
      const image = assignments.data?.image
      if (!image) {
        throw new Error('No image-generation model is configured.')
      }

      // At least one of {brief, screenshot} drives generation: text-only → a
      // brief-driven asset sheet; screenshot → deconstruction; both → guided.
      const parts: PromptPart[] = []
      const brief = requirement?.trim()
      if (brief) parts.push({ type: 'text', text: brief })
      if (bytes) parts.push({ type: 'image', image: bytes })
      if (parts.length === 0) {
        throw new Error('Provide a screenshot or a brief to generate.')
      }

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
      loadImage({ bitmap, name: 'generated-sheet' })
      return asset
    },
  })
}
