import { describe, expect, it, vi } from 'vitest'
import {
  UNKNOWN_AI_ERROR_MESSAGE,
  aiDisplayErrorMessage,
} from './display-error-message'

describe('AI display error messages', () => {
  it('extracts only bounded strings from reviewed Tauri rejection fields', () => {
    expect(aiDisplayErrorMessage({
      code: 'credential-unavailable',
      message: 'The native credential is no longer available.',
    })).toBe('The native credential is no longer available.')
    expect(aiDisplayErrorMessage({ error: 'Provider verification failed.' }))
      .toBe('Provider verification failed.')
    expect(aiDisplayErrorMessage({ detail: 'The model catalog changed.' }))
      .toBe('The model catalog changed.')
    expect(aiDisplayErrorMessage({ code: 'probe-failed' })).toBe('probe-failed')
  })

  it('uses a stable fallback for arbitrary, oversized, accessor, or stringified objects', () => {
    const getter = vi.fn(() => 'do not invoke')
    const accessor = Object.defineProperty({}, 'message', { get: getter })
    for (const value of [
      null,
      42,
      {},
      { message: { nested: 'unsafe' } },
      { message: 'x'.repeat(501) },
      '[object Object]',
      new Error('[object Object]'),
      new Error('Setup failed: [object Object]'),
      accessor,
    ]) {
      expect(aiDisplayErrorMessage(value)).toBe(UNKNOWN_AI_ERROR_MESSAGE)
    }
    expect(getter).not.toHaveBeenCalled()
  })

  it('never returns credential-shaped payloads', () => {
    const secret = 'sk-secretsecretsecret'
    expect(aiDisplayErrorMessage(secret)).toBe(UNKNOWN_AI_ERROR_MESSAGE)
    expect(aiDisplayErrorMessage({ message: `authorization=Bearer ${secret}` }))
      .toBe(UNKNOWN_AI_ERROR_MESSAGE)
  })
})
