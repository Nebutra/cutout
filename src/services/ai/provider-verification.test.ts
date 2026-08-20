import { describe, expect, it, vi } from 'vitest'
import {
  ensureProviderVerification,
  loadProviderVerifications,
  providerEligibleForAuto,
  providerRouteVerified,
  providerVerificationsSnapshot,
  providerVerified,
  setProviderVerification,
  subscribeProviderVerifications,
} from './provider-verification'
import type { ProviderConfig } from './provider-types'

function memory() {
  let value: string | null = null
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next
    },
  }
}

function connection(models: readonly string[]): Pick<ProviderConfig, 'catalog'> {
  return { catalog: { models, fetchedAt: '2026-08-20T00:00:00.000Z' } }
}

describe('provider verification receipt', () => {
  it('keeps unverified and failed providers out of Auto until a successful probe', () => {
    const store = memory()
    expect(providerEligibleForAuto('unverified', store)).toBe(false)
    setProviderVerification('p', { status: 'unverified' }, store)
    expect(providerVerified('p', store)).toBe(false)
    expect(providerEligibleForAuto('p', store)).toBe(false)
    setProviderVerification('p', { status: 'failed', detail: '401' }, store)
    expect(providerEligibleForAuto('p', store)).toBe(false)
    setProviderVerification('p', {
      status: 'verified',
      checkedAt: '2026-07-15T00:00:00.000Z',
    }, store)
    expect(providerVerified('p', store)).toBe(true)
    expect(providerEligibleForAuto('p', store)).toBe(true)
  })

  it('reads pre-catalog receipts that still carry model keys', () => {
    const store = memory()
    // A receipt written before the catalog moved onto the connection. Rejecting
    // it outright would downgrade an already-verified provider to unverified.
    store.setItem(
      'cutout.provider-verification.v1',
      JSON.stringify({
        legacy: {
          status: 'verified',
          checkedAt: '2026-07-15T00:00:00.000Z',
          model: 'chat-model',
          models: ['chat-model'],
        },
      }),
    )
    expect(providerVerified('legacy', store)).toBe(true)
    expect(loadProviderVerifications(store).legacy).not.toHaveProperty('models')
  })

  it('notifies same-window subscribers after a persisted receipt changes', () => {
    vi.stubGlobal('localStorage', memory())
    const listener = vi.fn()
    const unsubscribe = subscribeProviderVerifications(listener)
    setProviderVerification('observable', {
      status: 'verified',
      checkedAt: '2026-07-28T00:00:00.000Z',
    })
    expect(listener).toHaveBeenCalledOnce()
    expect(providerVerificationsSnapshot().observable?.status).toBe('verified')
    unsubscribe()
    vi.unstubAllGlobals()
  })
})

describe('providerRouteVerified', () => {
  it('needs both a passing receipt and catalog evidence for the model', () => {
    const verified = { status: 'verified', checkedAt: '2026-07-15T00:00:00.000Z' } as const
    expect(providerRouteVerified(connection(['a']), verified)).toBe(true)
    expect(providerRouteVerified(connection(['a']), verified, 'a')).toBe(true)
    // The credential works, but nothing proves this slug is reachable on it.
    expect(providerRouteVerified(connection(['a']), verified, 'b')).toBe(false)
    // The slug is advertised, but the credential never passed.
    expect(providerRouteVerified(connection(['a']), { status: 'unverified' }, 'a')).toBe(false)
    expect(providerRouteVerified(undefined, verified, 'a')).toBe(false)
  })
})

describe('ensureProviderVerification', () => {
  it('probes a provider with no record and persists verified', async () => {
    const store = memory()
    let probes = 0
    expect(await ensureProviderVerification('unverified', async () => {
      probes += 1
      return ['m']
    }, { storage: store })).toBe('verified')
    expect(probes).toBe(1)
    expect(providerEligibleForAuto('unverified', store)).toBe(true)
  })

  it('re-probes an inconclusive unverified record', async () => {
    const store = memory()
    setProviderVerification('p', { status: 'unverified' }, store)
    expect(await ensureProviderVerification('p', async () => ['m'], { storage: store })).toBe('verified')
  })

  it('re-probes a verified record with no check timestamp', async () => {
    const store = memory()
    setProviderVerification('p', { status: 'verified' }, store)
    expect(await ensureProviderVerification('p', async () => ['m'], { storage: store })).toBe('verified')
    expect(providerVerified('p', store)).toBe(true)
  })

  it('requires catalog evidence for the required model', async () => {
    const store = memory()
    setProviderVerification('p', {
      status: 'verified',
      checkedAt: '2026-07-15T00:00:00.000Z',
    }, store)
    let probes = 0
    // The known catalog lacks the required model, so the receipt alone is not
    // enough — it re-probes, and the fresh catalog settles it.
    expect(await ensureProviderVerification('p', async () => {
      probes += 1
      return ['chat-model', 'image-model']
    }, { storage: store, requiredModel: 'image-model', catalogModels: ['chat-model'] })).toBe('verified')
    expect(probes).toBe(1)

    expect(await ensureProviderVerification('p', async () => {
      probes += 1
      return ['chat-model']
    }, { storage: store, requiredModel: 'missing-model', catalogModels: ['chat-model'] })).toBe('failed')
    expect(probes).toBe(2)
  })

  it('skips the probe when the known catalog already proves the model', async () => {
    const store = memory()
    setProviderVerification('p', {
      status: 'verified',
      checkedAt: '2026-07-15T00:00:00.000Z',
    }, store)
    let probes = 0
    expect(await ensureProviderVerification('p', async () => {
      probes += 1
      return ['chat-model']
    }, { storage: store, requiredModel: 'chat-model', catalogModels: ['chat-model'] })).toBe('verified')
    expect(probes).toBe(0)
  })

  it('persists failed on probe error and never re-probes conclusive records', async () => {
    const store = memory()
    let probes = 0
    expect(await ensureProviderVerification('p', async () => {
      probes += 1
      throw new Error('401')
    }, { storage: store })).toBe('failed')
    expect(await ensureProviderVerification('p', async () => {
      probes += 1
      return ['m']
    }, { storage: store })).toBe('failed')
    setProviderVerification('v', {
      status: 'verified',
      checkedAt: '2026-07-15T00:00:00.000Z',
    }, store)
    expect(await ensureProviderVerification('v', async () => {
      probes += 1
      return ['m']
    }, { storage: store })).toBe('verified')
    expect(probes).toBe(1)
  })
})
