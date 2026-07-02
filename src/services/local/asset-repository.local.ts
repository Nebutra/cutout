/**
 * Local asset repository (spec §5 / §6).
 *
 * Persists slices to disk through the Tauri `save_assets` command, reached ONLY
 * via the injected {@link NativeBridge} (tests pass a fake — no Tauri runtime).
 * Each blob is decoded to raw PNG bytes (`Uint8Array`) here; the bridge marshals
 * to the Rust `Vec<u8>`.
 *
 * `list` / `load` are stubs: v1 has no local asset library, but the methods
 * exist so the interface — and `assetKeys` query wiring — is already shaped for
 * the future `remote/` implementation.
 */
import type { NativeBridge, SaveAssetInput } from '@/platform/native'
import type {
  AssetRef,
  AssetRepository,
  AssetToSave,
  Result,
  SaveManyOutcome,
  SaveOptions,
} from '@/services/types'
import { err, isErr, ok } from '@/services/types'

/** Decode one blob into a bridge-ready `{ name, bytes }` input. */
async function toSaveInput(asset: AssetToSave): Promise<SaveAssetInput> {
  const bytes = new Uint8Array(await asset.blob.arrayBuffer())
  return { name: asset.name, bytes }
}

export function createLocalAssetRepository(
  bridge: NativeBridge,
): AssetRepository {
  async function saveMany(
    assets: readonly AssetToSave[],
    opts?: SaveOptions,
  ): Promise<Result<SaveManyOutcome>> {
    if (assets.length === 0) return err<SaveManyOutcome>('Nothing to export')
    try {
      const inputs = await Promise.all(assets.map(toSaveInput))
      const res = await bridge.saveAssets(inputs, opts?.destDir)

      const failedNames = new Set(res.failed.map((f) => f.name))
      const saved: AssetRef[] = res.canceled
        ? []
        : inputs
            .filter((input) => !failedNames.has(input.name))
            .map((input) => ({
              id: input.name,
              name: input.name,
              path: res.outputDir
                ? `${res.outputDir}/${input.name}`
                : undefined,
            }))

      return ok<SaveManyOutcome>({
        saved,
        failed: res.failed,
        outputDir: res.outputDir,
        canceled: res.canceled,
      })
    } catch (error) {
      return err<SaveManyOutcome>(
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  return {
    saveMany,

    saveOne: async (asset, opts) => {
      const result = await saveMany([asset], opts)
      if (isErr(result)) return err<AssetRef>(result.error)
      const { saved, failed, canceled } = result.data
      if (canceled) return err<AssetRef>('Export canceled')
      if (saved.length === 0) {
        return err<AssetRef>(failed[0]?.error ?? 'Failed to save asset')
      }
      return ok<AssetRef>(saved[0])
    },

    // Stubs — v1 has no local library. Shaped for the future remote impl.
    list: async () => ok<AssetRef[]>([]),
    load: async (id) => err<Blob>(`Local library has no asset "${id}"`),
  }
}
