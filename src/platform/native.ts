/**
 * Native platform bridge — the ONLY module allowed to import `@tauri-apps/api`.
 *
 * Everything above (services, hooks, components) depends on the `NativeBridge`
 * interface, so tests inject a fake and no Tauri runtime is required. See spec §4a.
 */
import { invoke } from '@tauri-apps/api/core'

/** One asset to persist. `bytes` is primary; `dataUrl` is a fallback. */
export interface SaveAssetInput {
  name: string
  bytes?: Uint8Array
  dataUrl?: string
}

/** A single file that failed to write, mirrored from the Rust `FailedWrite`. */
export interface FailedWrite {
  name: string
  error: string
}

/** Result of a save operation, mirrored from the Rust `SaveAssetsResult`. */
export interface SaveAssetsResult {
  canceled: boolean
  outputDir: string | null
  count: number
  failed: FailedWrite[]
}

export interface SaveBundleFileInput {
  path: string
  bytes: Uint8Array
}

export interface SaveBundleInput {
  name: string
  files: SaveBundleFileInput[]
}

export interface SaveBundleFileReceipt {
  path: string
  size: number
  sha256: string
}

export interface SaveBundleResult {
  canceled: boolean
  outputDir: string | null
  bundleDir: string | null
  fileCount: number
  totalBytes: number
  files: SaveBundleFileReceipt[]
}

export interface NativeRepositoryScanResult {
  canceled: boolean
  label: string | null
  entries: { path: string; bytes: number; mediaType: string; sha256: string }[]
  frameworkHints: { framework: string; evidence: string[]; confidence: 'medium' | 'high' }[]
  excluded: Record<'symbolicLink' | 'secretPath' | 'secretContent' | 'ignoredDirectory' | 'binary' | 'oversized' | 'unsupported', number>
}

export type VectorizerAiMode =
  | 'production'
  | 'preview'
  | 'test'
  | 'test_preview'

export interface VectorizeSvgResult {
  svg: string
}

export interface NativeBridge {
  /**
   * Persist assets. When `destDir` is a valid existing directory the native
   * side writes there directly (no picker); otherwise it opens the folder
   * picker. `destDir` is the remembered-output-folder path (see export prefs).
   */
  saveAssets(
    assets: SaveAssetInput[],
    destDir?: string,
  ): Promise<SaveAssetsResult>
  /** Atomically write a nested multi-file bundle under a native-picked root. */
  saveBundle(bundle: SaveBundleInput): Promise<SaveBundleResult>
  /** Opens a native folder picker and returns a metadata-only safe inventory. */
  scanRepository?(): Promise<NativeRepositoryScanResult>
  setVectorizerApiKey(apiId: string, apiSecret: string): Promise<void>
  vectorizerKeyStatus(apiId: string): Promise<boolean>
  deleteVectorizerApiKey(apiId: string): Promise<void>
  vectorizeLocalVTracer(bytes: Uint8Array): Promise<VectorizeSvgResult>
  vectorizeVectorizerAi(input: {
    apiId: string
    bytes: Uint8Array
    mode?: VectorizerAiMode
  }): Promise<VectorizeSvgResult>
}

/**
 * Transport shape: `Uint8Array` is converted to a plain `number[]` because
 * `invoke` serializes arguments as JSON. Rust deserializes `Vec<u8>` from it.
 */
interface SaveAssetPayload {
  name: string
  bytes: number[] | null
  dataUrl: string | null
}

interface SaveBundlePayload {
  name: string
  files: { path: string; bytes: number[] }[]
}

function toPayload(asset: SaveAssetInput): SaveAssetPayload {
  return {
    name: asset.name,
    bytes: asset.bytes ? Array.from(asset.bytes) : null,
    dataUrl: asset.dataUrl ?? null,
  }
}

/** Concrete Tauri implementation of {@link NativeBridge}. */
export const tauriBridge: NativeBridge = {
  saveAssets: (assets, destDir) =>
    invoke<SaveAssetsResult>('save_assets', {
      assets: assets.map(toPayload),
      destDir: destDir ?? null,
    }),
  saveBundle: (bundle) => {
    const payload: SaveBundlePayload = {
      name: bundle.name,
      files: bundle.files.map((file) => ({
        path: file.path,
        bytes: Array.from(file.bytes),
      })),
    }
    return invoke<SaveBundleResult>('save_bundle', { bundle: payload })
  },
  scanRepository: () => invoke<NativeRepositoryScanResult>('scan_repository'),
  setVectorizerApiKey: (apiId, apiSecret) =>
    invoke('set_vectorizer_api_key', { apiId, apiSecret }),
  vectorizerKeyStatus: (apiId) =>
    invoke<boolean>('vectorizer_key_status', { apiId }),
  deleteVectorizerApiKey: (apiId) =>
    invoke('delete_vectorizer_api_key', { apiId }),
  vectorizeLocalVTracer: (bytes) =>
    invoke<VectorizeSvgResult>('vectorize_local_vtracer', {
      bytes: Array.from(bytes),
    }),
  vectorizeVectorizerAi: ({ apiId, bytes, mode }) =>
    invoke<VectorizeSvgResult>('vectorize_vectorizer_ai', {
      apiId,
      bytes: Array.from(bytes),
      mode: mode ?? null,
    }),
}
