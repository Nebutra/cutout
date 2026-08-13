import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasNativeDesktopHost } from './runtime'

describe('native desktop runtime detection', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('requires the callable Tauri invoke boundary', () => {
    expect(hasNativeDesktopHost()).toBe(false)
    vi.stubGlobal('__TAURI_INTERNALS__', {})
    expect(hasNativeDesktopHost()).toBe(false)
    vi.stubGlobal('__TAURI_INTERNALS__', { invoke: vi.fn() })
    expect(hasNativeDesktopHost()).toBe(true)
  })
})
