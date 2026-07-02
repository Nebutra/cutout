/**
 * Service contracts (spec §5) — the swap seam.
 *
 * These interfaces are the boundary between the app and every I/O-shaped
 * operation (export now; accounts, cloud library, cloud cutout later). v1 ships
 * `local/` implementations; a future backend lands `remote/` impls behind the
 * SAME interfaces, flipped in one place (`createLocalRegistry` → remote).
 */
import type { Box, CutoutParams } from '@/algorithm/types'
import type { ProviderService, GenerationService } from './ai/types'

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

/* --- Asset repository (Tauri fs now, HTTP later) --- */

/** A reference to a persisted asset. `path` is set for local fs writes. */
export interface AssetRef {
  readonly id: string
  readonly name: string
  readonly path?: string
}

/** One asset to save: filename + raw PNG bytes (from a blob). */
export interface AssetToSave {
  readonly name: string
  readonly blob: Blob
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
  list(filter?: AssetListFilter): Promise<Result<AssetRef[]>>
  load(id: string): Promise<Result<Blob>>
  saveOne(asset: AssetToSave, opts?: SaveOptions): Promise<Result<AssetRef>>
  saveMany(
    assets: readonly AssetToSave[],
    opts?: SaveOptions,
  ): Promise<Result<SaveManyOutcome>>
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
  /** BYOK key + provider management (spec §5). */
  readonly providers: ProviderService
  /** BYOK text generation over the Rust proxy (spec §5). */
  readonly generation: GenerationService
}
