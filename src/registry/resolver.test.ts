import { describe, expect, it, vi } from 'vitest'
import { createRegistryResolver, RegistryResolutionError, type RegistryHost } from './resolver'
import { validRegistryItem } from './contracts.test'

const bytes = new TextEncoder().encode('hello world!')
const sha256 = '7509e5bda0c762d2bac7f90d758b5b2263fa01ccbc542ab5e3df163be08e6ca9'
const item = { ...validRegistryItem, files: [{ ...validRegistryItem.files[0], size: bytes.byteLength, sha256 }] }

function host(overrides: Partial<RegistryHost> = {}): RegistryHost {
  return {
    source: { id: 'builtin', kind: 'bundled' },
    readItem: vi.fn(async () => item),
    readFile: vi.fn(async () => bytes),
    ...overrides,
  }
}

describe('RegistryResolver', () => {
  it('returns only schema- and content-verified items', async () => {
    const result = await createRegistryResolver([host()]).resolve({ sourceId: 'builtin', itemId: 'acme.button', version: '1.2.3' })
    expect(result.item.id).toBe('acme.button')
    expect(result.verifiedFiles).toEqual([{ path: 'src/button.tsx', size: 12, sha256 }])
    expect(result.source.kind).toBe('bundled')
  })

  it('supports an injected HTTP host without performing network itself', async () => {
    const httpHost = host({ source: { id: 'catalog', kind: 'http', baseUrl: 'https://registry.example.test' } })
    await createRegistryResolver([httpHost]).resolve({ sourceId: 'catalog', itemId: 'acme.button' })
    expect(httpHost.readItem).toHaveBeenCalledOnce()
  })

  it.each([
    ['source-not-found', () => createRegistryResolver([]).resolve({ sourceId: 'missing', itemId: 'acme.button' })],
    ['item-mismatch', () => createRegistryResolver([host({ readItem: async () => ({ ...item, id: 'other.button' }) })]).resolve({ sourceId: 'builtin', itemId: 'acme.button' })],
    ['version-mismatch', () => createRegistryResolver([host()]).resolve({ sourceId: 'builtin', itemId: 'acme.button', version: '9.0.0' })],
    ['file-size-mismatch', () => createRegistryResolver([host({ readFile: async () => new Uint8Array([1]) })]).resolve({ sourceId: 'builtin', itemId: 'acme.button' })],
    ['file-hash-mismatch', () => createRegistryResolver([host({ readFile: async () => new Uint8Array(bytes.byteLength) })]).resolve({ sourceId: 'builtin', itemId: 'acme.button' })],
  ])('rejects %s', async (code, run) => {
    await expect(run()).rejects.toMatchObject({ code })
  })

  it('rejects duplicate hosts and honors cancellation', async () => {
    expect(() => createRegistryResolver([host(), host()])).toThrow(RegistryResolutionError)
    const controller = new AbortController()
    controller.abort()
    await expect(createRegistryResolver([host()]).resolve({ sourceId: 'builtin', itemId: 'acme.button' }, { signal: controller.signal })).rejects.toMatchObject({ code: 'aborted' })
  })
})
