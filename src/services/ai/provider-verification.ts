/**
 * The receipt of the last credential probe for a connection.
 *
 * This is a *receipt*, not a catalog. The models a connection advertises live
 * on `ProviderConfig.catalog` (layer 2), persisted beside the connection in
 * `providers.json`; keeping them here as well is what let a browser-storage
 * wipe silently strip a provider of its model list. Pre-v0.1.25 records still
 * carry `model` / `models` keys, so the schema stays permissive and drops them.
 */
import { z } from 'zod'
import {
  providerCatalogHasModel,
  type ProviderConfig,
} from './provider-types'

const KEY = 'cutout.provider-verification.v1'
const record = z.object({
  status: z.enum(['unverified', 'verified', 'failed']),
  checkedAt: z.string().datetime().optional(),
  detail: z.string().max(500).optional(),
}).transform(({ status, checkedAt, detail }) => ({
  status,
  ...(checkedAt ? { checkedAt } : {}),
  ...(detail ? { detail } : {}),
}))

export type ProviderVerification = z.output<typeof record>

type ReadStorage = Pick<Storage, 'getItem'>
type WriteStorage = Pick<Storage, 'getItem' | 'setItem'>

const listeners = new Set<() => void>()
let snapshot: Readonly<Record<string, ProviderVerification>> | undefined

function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

export function loadProviderVerifications(
  storage?: ReadStorage,
): Readonly<Record<string, ProviderVerification>> {
  try {
    const value = JSON.parse((storage ?? defaultStorage())?.getItem(KEY) ?? '{}')
    return z.record(z.string(), record).parse(value)
  } catch {
    return {}
  }
}

export function providerVerificationsSnapshot(): Readonly<
  Record<string, ProviderVerification>
> {
  snapshot ??= loadProviderVerifications()
  return snapshot
}

export function subscribeProviderVerifications(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setProviderVerification(
  providerId: string,
  value: ProviderVerification,
  storage?: WriteStorage,
): void {
  const host = storage ?? defaultStorage()
  if (!host) return
  const next = { ...loadProviderVerifications(host), [providerId]: record.parse(value) }
  host.setItem(KEY, JSON.stringify(next))
  if (!storage) {
    snapshot = next
    listeners.forEach((listener) => listener())
  }
}

/** Did the last probe of this connection succeed? Says nothing about models. */
export function providerVerificationIsVerified(
  value: ProviderVerification | undefined,
): boolean {
  return value?.status === 'verified' && Boolean(value.checkedAt)
}

/**
 * Is `model` executable on this connection right now? Requires both a passing
 * credential receipt (layer 1) and catalog evidence for the slug (layer 2).
 * Omit `model` to ask only about the connection.
 */
export function providerRouteVerified(
  provider: Pick<ProviderConfig, 'catalog'> | undefined,
  verification: ProviderVerification | undefined,
  model?: string,
): boolean {
  if (!providerVerificationIsVerified(verification)) return false
  return model === undefined || providerCatalogHasModel(provider, model)
}

export function providerVerified(
  providerId: string,
  storage?: ReadStorage,
): boolean {
  return providerVerificationIsVerified(loadProviderVerifications(storage)[providerId])
}

/** Auto routing is fail-closed. Unverified providers remain explicitly selectable. */
export function providerEligibleForAuto(
  providerId: string,
  storage?: ReadStorage,
): boolean {
  return providerVerified(providerId, storage)
}
/**
 * Settle a connection with no conclusive receipt by running the same probe as
 * Settings "Verify" and persisting the outcome.
 *
 * `probe` owns both halves of a verification: it round-trips the credential and
 * persists the catalog it discovers, then returns that catalog so the required
 * model can be checked. A conclusive record is not re-probed unless
 * `requiredModel` lacks catalog evidence in `catalogModels`.
 */
export async function ensureProviderVerification(
  providerId: string,
  probe: () => Promise<readonly string[]>,
  options: {
    readonly storage?: WriteStorage
    readonly requiredModel?: string
    /** The connection's currently known catalog (`provider.catalog?.models`). */
    readonly catalogModels?: readonly string[]
  } = {},
): Promise<ProviderVerification['status']> {
  const { storage, requiredModel, catalogModels } = options
  const existing = loadProviderVerifications(storage)[providerId]
  const alreadyProven = providerVerificationIsVerified(existing)
    && (requiredModel === undefined || (catalogModels ?? []).includes(requiredModel))
  if (existing?.status === 'failed' || alreadyProven) {
    return existing!.status
  }
  try {
    const models = await probe()
    setProviderVerification(providerId, {
      status: 'verified',
      checkedAt: new Date().toISOString(),
    }, storage)
    return requiredModel === undefined || models.includes(requiredModel)
      ? 'verified'
      : 'failed'
  } catch (error) {
    setProviderVerification(providerId, {
      status: 'failed',
      checkedAt: new Date().toISOString(),
      detail: error instanceof Error ? error.message : String(error),
    }, storage)
    return 'failed'
  }
}
