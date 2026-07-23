import type { NativeBridge } from '@/platform/native'
import { bytesToBlob } from '@/lib/image'
import type { ForegroundSegmentationService } from '../types'
import { err, ok } from '../types'

export function createLocalForegroundSegmentationService(
  bridge: NativeBridge,
): ForegroundSegmentationService {
  return {
    async capabilities() {
      if (!bridge.foregroundSegmentationCapabilities) {
        return ok({
          available: false,
          platform: 'browser',
          backend: 'unavailable',
          reason: 'capability-required: foreground segmentation requires the macOS desktop host.',
        })
      }
      try {
        return ok(await bridge.foregroundSegmentationCapabilities())
      } catch (error) {
        return err(errorText(error))
      }
    },
    async segment(input) {
      if (input.signal?.aborted) return err('Foreground segmentation was cancelled.')
      if (!bridge.foregroundSegment) {
        return err('capability-required: foreground segmentation requires the macOS desktop host.')
      }
      try {
        const result = await bridge.foregroundSegment(input.bytes)
        if (input.signal?.aborted) return err('Foreground segmentation was cancelled.')
        return ok({
          png: bytesToBlob(result.pngBytes, 'image/png'),
          width: result.width,
          height: result.height,
          instanceCount: result.instanceCount,
          backend: result.backend,
        })
      } catch (error) {
        return err(errorText(error))
      }
    },
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
