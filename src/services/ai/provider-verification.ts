import { z } from 'zod'

const KEY = 'cutout.provider-verification.v1'
const record = z.object({
  status: z.enum(['unverified', 'verified', 'failed']),
  checkedAt: z.string().datetime().optional(),
  model: z.string().min(1).optional(),
  models: z.array(z.string().min(1)).min(1).optional(),
  detail: z.string().max(500).optional(),
}).strict()

export type ProviderVerification = z.infer<typeof record>

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

export function providerVerificationIsVerified(
  value: ProviderVerification | undefined,
  requiredModel?: string,
): boolean {
  if (value?.status !== 'verified' || !value.checkedAt || !value.model) return false
  if (!requiredModel) return true
  return (value.models ?? [value.model]).includes(requiredModel)
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
/** Settle a provider with no conclusive receipt by running the same probe as
 * Settings "Verify" and persisting the outcome. Conclusive records are not
 * re-probed unless the required model lacks authenticated catalog evidence. */
export async function ensureProviderVerification(
  providerId: string,
  probe: () => Promise<{ model: string; models?: readonly string[] }>,
  storage?: WriteStorage,
  requiredModel?: string,
): Promise<ProviderVerification['status']> {
  const existing = loadProviderVerifications(storage)[providerId]
  if (existing?.status === 'failed' || providerVerificationIsVerified(existing, requiredModel)) {
    return existing.status
  }
  try {
    const { model, models: probedModels } = await probe()
    const models = [...new Set(probedModels ?? [model])]
    setProviderVerification(providerId, {
      status: 'verified',
      model,
      models,
      checkedAt: new Date().toISOString(),
    }, storage)
    return !requiredModel || models.includes(requiredModel) ? 'verified' : 'failed'
  } catch (error) {
    setProviderVerification(providerId, {
      status: 'failed',
      checkedAt: new Date().toISOString(),
      detail: error instanceof Error ? error.message : String(error),
    }, storage)
    return 'failed'
  }
}
