/**
 * Local vectorization service.
 *
 * Keeps PNG→SVG conversion behind the service registry so export mutations can
 * select a route without knowing whether the work runs offline in Rust or via a
 * remote vectorization API.
 */
import type { NativeBridge } from '@/platform/native'
import { ensureSvgName } from '@/lib/filename'
import type {
  AssetToSave,
  Result,
  VectorizeInput,
  VectorizeService,
} from '@/services/types'
import { err, ok } from '@/services/types'

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

function svgToAsset(source: AssetToSave, svg: string): AssetToSave {
  return {
    name: ensureSvgName(source.name),
    blob: new Blob([svg], { type: 'image/svg+xml' }),
    kind: source.kind,
  }
}

export function createLocalVectorizeService(
  bridge: NativeBridge,
): VectorizeService {
  async function vectorize(input: VectorizeInput): Promise<Result<AssetToSave>> {
    try {
      const bytes = await blobToBytes(input.asset.blob)
      const result =
        input.route === 'local'
          ? await bridge.vectorizeLocalVTracer(bytes)
          : await bridge.vectorizeVectorizerAi({
              apiId: input.apiId ?? '',
              bytes,
              mode: input.apiMode,
            })
      return ok(svgToAsset(input.asset, result.svg))
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error))
    }
  }

  return {
    vectorize,

    async setApiKey(apiId, apiSecret) {
      try {
        await bridge.setVectorizerApiKey(apiId, apiSecret)
        return ok(undefined)
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error))
      }
    },

    async apiKeyStatus(apiId) {
      try {
        return ok(await bridge.vectorizerKeyStatus(apiId))
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error))
      }
    },

    async deleteApiKey(apiId) {
      try {
        await bridge.deleteVectorizerApiKey(apiId)
        return ok(undefined)
      } catch (error) {
        return err(error instanceof Error ? error.message : String(error))
      }
    },
  }
}
