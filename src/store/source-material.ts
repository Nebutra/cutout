import { bitmapToBytes } from '@/lib/image'
import type { SourceState } from './types'

export interface ResolvedSourceMaterial {
  readonly bytes: Uint8Array
  readonly mediaType: string
  readonly encoding: 'original' | 'normalized-png'
}

/** Preserve encoded inputs exactly; normalize only bitmap-only legacy sources. */
export async function resolveSourceMaterial(
  source: SourceState,
): Promise<ResolvedSourceMaterial> {
  if (source.encodedImage) {
    if (!source.encodedImage.type) {
      throw new Error('The encoded source image is missing its media type.')
    }
    return {
      bytes: new Uint8Array(await source.encodedImage.arrayBuffer()),
      mediaType: source.encodedImage.type,
      encoding: 'original',
    }
  }
  if (!source.bitmap) throw new Error('A loaded source image is required.')
  return {
    bytes: await bitmapToBytes(source.bitmap),
    mediaType: 'image/png',
    encoding: 'normalized-png',
  }
}
