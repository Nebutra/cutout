import { describe, expect, it, vi } from 'vitest'
import {
  ensureProviderVerification,
  loadProviderVerifications,
  providerEligibleForAuto,
  providerVerificationIsVerified,
  providerVerificationsSnapshot,
  providerVerified,
  setProviderVerification,
  subscribeProviderVerifications,
} from './provider-verification'

function memory() {
  let value: string | null = null
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next
    },
  }
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
      model: 'm',
      checkedAt: '2026-07-15T00:00:00.000Z',
    }, store)
    expect(providerVerified('p', store)).toBe(true)
    expect(providerEligibleForAuto('p', store)).toBe(true)
  })

  it('notifies same-window subscribers after a persisted receipt changes', () => {
    vi.stubGlobal('localStorage', memory())
    const listener = vi.fn()
    const unsubscribe = subscribeProviderVerifications(listener)
    setProviderVerification('observable', {
      status: 'verified',
      model: 'm',
      checkedAt: '2026-07-28T00:00:00.000Z',
    })
    expect(listener).toHaveBeenCalledOnce()
    expect(providerVerificationsSnapshot().observable?.status).toBe('verified')
    unsubscribe()
    vi.unstubAllGlobals()
  })
})

describe('ensureProviderVerification', () => {
  it('probes a provider with no record and persists verified', async () => {
    const store = memory()
    let probes = 0
    expect(await ensureProviderVerification('unverified', async () => {
      probes += 1
      return { model: 'm' }
    }, store)).toBe('verified')
    expect(probes).toBe(1)
    expect(providerEligibleForAuto('unverified', store)).toBe(true)
  })

  it('re-probes an inconclusive unverified record', async () => {
    const store = memory()
    setProviderVerification('p', { status: 'unverified' }, store)
    expect(await ensureProviderVerification('p', async () => ({ model: 'm' }), store)).toBe('verified')
  })

  it('re-probes a malformed verified record without receipt evidence', async () => {
    const store = memory()
    setProviderVerification('p', { status: 'verified' }, store)
    expect(await ensureProviderVerification('p', async () => ({ model: 'm' }), store)).toBe('verified')
    expect(providerVerified('p', store)).toBe(true)
  })

  it('requires authenticated catalog evidence for the assigned model', async () => {
    const store = memory()
    setProviderVerification('p', {
      status: 'verified',
      model: 'chat-model',
      checkedAt: '2026-07-15T00:00:00.000Z',
    }, store)
    let probes = 0
    expect(await ensureProviderVerification('p', async () => {
      probes += 1
      return { model: 'chat-model', models: ['chat-model', 'image-model'] }
    }, store, 'image-model')).toBe('verified')
    expect(probes).toBe(1)
    expect(providerVerificationIsVerified(
      loadProviderVerifications(store).p,
      'image-model',
    )).toBe(true)

    expect(await ensureProviderVerification('p', async () => {
      probes += 1
      return { model: 'chat-model', models: ['chat-model'] }
    }, store, 'missing-model')).toBe('failed')
    expect(probes).toBe(2)
    expect(providerVerificationIsVerified(
      loadProviderVerifications(store).p,
      'missing-model',
    )).toBe(false)
  })

  it('persists failed on probe error and never re-probes conclusive records', async () => {
    const store = memory()
    let probes = 0
    expect(await ensureProviderVerification('p', async () => {
      probes += 1
      throw new Error('401')
    }, store)).toBe('failed')
    expect(await ensureProviderVerification('p', async () => {
      probes += 1
      return { model: 'm' }
    }, store)).toBe('failed')
    setProviderVerification('v', {
      status: 'verified',
      model: 'm',
      checkedAt: '2026-07-15T00:00:00.000Z',
    }, store)
    expect(await ensureProviderVerification('v', async () => {
      probes += 1
      return { model: 'm' }
    }, store)).toBe('verified')
    expect(probes).toBe(1)
  })
})
