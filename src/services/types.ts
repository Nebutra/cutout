/**
 * Service contracts (spec §5) — the swap seam.
 *
 * These interfaces are the boundary between the app and every I/O-shaped
 * operation (export now; accounts, cloud library, cloud cutout later). v1 ships
 * `local/` implementations; a future backend lands `remote/` impls behind the
 * SAME interfaces, flipped in one place (`createLocalRegistry` → remote).
 */
import type { Box, CutoutParams } from '@/algorithm/types'
import type { NativeRepositoryScanResult, VectorizerAiMode } from '@/platform/native'
import type { ProviderService, GenerationService } from './ai/types'
import type { PromptService } from '@/prompts/types'

/** Uniform success/failure envelope so callers never throw across the seam. */
export type Result<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string }

export const ok = <T>(data: T): Result<T> => ({ ok: true, data })
export const err = <T = never>(error: string): Result<T> => ({
  ok: false,
  error,
})

/**
 * Explicit success guard. Preferred over `!result.ok` control-flow narrowing:
 * a type-predicate resolves reliably even when a `Result<T>` flows through an
 * inner-function inference cycle (where `!result.ok` can mis-narrow under the
 * bundler's `verbatimModuleSyntax` type resolution).
 */
export function isOk<T>(
  result: Result<T>,
): result is { readonly ok: true; readonly data: T } {
  return result.ok
}

/** Explicit failure guard (companion to {@link isOk}). */
export function isErr<T>(
  result: Result<T>,
): result is { readonly ok: false; readonly error: string } {
  return !result.ok
}

/* --- Cutout (worker now, HTTP later) --- */

/** One produced slice from a cutout run. */
export interface CutoutSlice {
  readonly id: string
  readonly index: number
  readonly box: Box
  readonly png: Blob
  readonly width: number
  readonly height: number
}

export interface CutoutResult {
  readonly slices: readonly CutoutSlice[]
}

export interface CutoutRunInput {
  readonly bitmap: ImageBitmap
  readonly params: CutoutParams
  readonly signal?: AbortSignal
}

export interface CutoutService {
  run(input: CutoutRunInput): Promise<Result<CutoutResult>>
}

/* --- Asset repository (Tauri fs export + IndexedDB library now, HTTP later) --- */

/** Where a library asset originated (drives filtering + provenance display). */
export type AssetKind = 'slice' | 'import' | 'generated'

/**
 * A reference to an asset. `path` is set for local fs writes (export); the
 * library metadata (`kind`/`width`/`height`/`createdAt`/`thumb`) is populated
 * for IndexedDB-backed library items so the gallery renders from `list()` alone.
 */
export interface AssetRef {
  readonly id: string
  readonly name: string
  readonly path?: string
  readonly kind?: AssetKind
  readonly width?: number
  readonly height?: number
  readonly createdAt?: number
  /** Small downscaled preview for the gallery grid (library items only). */
  readonly thumb?: Blob
}

/** One asset to save/add: filename + blob, with an optional library `kind`. */
export interface AssetToSave {
  readonly name: string
  readonly blob: Blob
  readonly kind?: AssetKind
}

/** Optional save hints (e.g. a remembered destination). */
export interface SaveOptions {
  readonly destDir?: string
}

/** Query filter for listing assets (branch point for team/scope later). */
export interface AssetListFilter {
  readonly query?: string
}

export interface SaveManyOutcome {
  readonly saved: readonly AssetRef[]
  readonly failed: readonly { name: string; error: string }[]
  readonly outputDir: string | null
  readonly canceled: boolean
}

export interface AssetRepository {
  /** List the managed library (IndexedDB), newest first, with thumbnails. */
  list(filter?: AssetListFilter): Promise<Result<AssetRef[]>>
  /** Load one library asset's full blob by id. */
  load(id: string): Promise<Result<Blob>>
  /** Persist an asset into the managed library (distinct from disk export). */
  add(asset: AssetToSave): Promise<Result<AssetRef>>
  /** Delete one library asset by id. */
  remove(id: string): Promise<Result<void>>
  /** Export one asset to disk (Tauri) — NOT the managed library. */
  saveOne(asset: AssetToSave, opts?: SaveOptions): Promise<Result<AssetRef>>
  /** Export many assets to disk (Tauri) — NOT the managed library. */
  saveMany(
    assets: readonly AssetToSave[],
    opts?: SaveOptions,
  ): Promise<Result<SaveManyOutcome>>
}

/* --- Atomic multi-file bundle export (native folder picker) --- */

export type BundleFileContent = string | Uint8Array | Blob

export interface BundleFileToSave {
  /** POSIX-style path relative to the bundle root, e.g. `tokens/colors.css`. */
  readonly path: string
  readonly content: BundleFileContent
}

export interface BundleToSave {
  /** Name of the new direct child created inside the user-selected directory. */
  readonly name: string
  readonly files: readonly BundleFileToSave[]
}

export interface BundleFileReceipt {
  readonly path: string
  readonly size: number
  readonly sha256: string
}

export interface BundleSaveReceipt {
  readonly canceled: boolean
  readonly outputDir: string | null
  readonly bundleDir: string | null
  readonly fileCount: number
  readonly totalBytes: number
  readonly files: readonly BundleFileReceipt[]
}

export interface BundleRepository {
  /**
   * Atomically exports a complete bundle under a user-selected native folder.
   * An existing target is never overwritten and partial bundles are never exposed.
   */
  save(bundle: BundleToSave): Promise<Result<BundleSaveReceipt>>
}

export interface RepositorySourceService {
  readonly nativeAvailable: boolean
  selectAndScan(): Promise<Result<NativeRepositoryScanResult>>
}

/* --- Vectorization (local VTracer now, API route now, backend later) --- */

export type SvgVectorizerRoute = 'local' | 'api'

export interface VectorizeInput {
  readonly asset: AssetToSave
  readonly route: SvgVectorizerRoute
  readonly apiId?: string
  readonly apiMode?: VectorizerAiMode
}

export interface VectorizeService {
  vectorize(input: VectorizeInput): Promise<Result<AssetToSave>>
  setApiKey(apiId: string, apiSecret: string): Promise<Result<void>>
  apiKeyStatus(apiId: string): Promise<Result<boolean>>
  deleteApiKey(apiId: string): Promise<Result<void>>
}

/* --- Session (stub now, auth later) --- */

export interface Session {
  readonly userId: string
  readonly isAuthenticated: boolean
}

export interface SessionService {
  current(): Promise<Session>
  signIn?(): Promise<Result<Session>>
  signOut?(): Promise<Result<void>>
}

/* --- Registry --- */

export interface ServiceRegistry {
  readonly session: SessionService
  readonly cutout: CutoutService
  readonly assets: AssetRepository
  readonly bundles: BundleRepository
  readonly repositorySources: RepositorySourceService
  readonly vectorize: VectorizeService
  /** BYOK key + provider management (spec §5). */
  readonly providers: ProviderService
  /** BYOK text generation over the Rust proxy (spec §5). */
  readonly generation: GenerationService
  /** Managed prompt catalog (spec §4) — versioned model-instruction assets. */
  readonly prompts: PromptService
}
