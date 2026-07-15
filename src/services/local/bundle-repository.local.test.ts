import { describe, expect, it, vi } from 'vitest'
import type { NativeBridge, SaveBundleInput, SaveBundleResult } from '@/platform/native'
import { createLocalBundleRepository } from './bundle-repository.local'

function bridgeWith(result: SaveBundleResult) {
  const calls: SaveBundleInput[] = []
  const saveBundle: NativeBridge['saveBundle'] = vi.fn(async (bundle) => {
    calls.push(bundle)
    return result
  })
  return {
    bridge: { saveBundle } as unknown as NativeBridge,
    saveBundle,
    calls,
  }
}

const receipt: SaveBundleResult = {
  canceled: false,
  outputDir: '/chosen',
  bundleDir: '/chosen/design-kit',
  fileCount: 2,
  totalBytes: 5,
  files: [
    { path: 'DESIGN.md', size: 3, sha256: 'a'.repeat(64) },
    { path: 'assets/logo.bin', size: 2, sha256: 'b'.repeat(64) },
  ],
}

describe('bundle-repository.local', () => {
  it('encodes nested text and binary files and returns the native hash receipt', async () => {
    const { bridge, calls } = bridgeWith(receipt)
    const repository = createLocalBundleRepository(bridge)

    const result = await repository.save({
      name: 'design-kit',
      files: [
        { path: 'DESIGN.md', content: 'abc' },
        { path: 'assets/logo.bin', content: new Uint8Array([4, 5]) },
      ],
    })

    expect(result).toEqual({ ok: true, data: receipt })
    const call = calls[0]
    expect(call).toBeDefined()
    if (!call) return
    expect(call.name).toBe('design-kit')
    expect(call.files.map((file) => ({ path: file.path, bytes: Array.from(file.bytes) }))).toEqual([
      { path: 'DESIGN.md', bytes: [97, 98, 99] },
      { path: 'assets/logo.bin', bytes: [4, 5] },
    ])
  })

  it('supports Blob binary content and preserves a canceled picker result', async () => {
    const canceled: SaveBundleResult = {
      canceled: true,
      outputDir: null,
      bundleDir: null,
      fileCount: 0,
      totalBytes: 0,
      files: [],
    }
    const { bridge, calls } = bridgeWith(canceled)
    const repository = createLocalBundleRepository(bridge)
    const result = await repository.save({
      name: 'brand-kit',
      files: [{ path: 'logo.bin', content: new Blob([new Uint8Array([9, 8])]) }],
    })

    expect(result).toEqual({ ok: true, data: canceled })
    expect(calls[0]?.files[0]?.bytes).toEqual(new Uint8Array([9, 8]))
  })

  it('rejects empty, excessive, unsafe, duplicate, and oversized bundles before native I/O', async () => {
    const { bridge, saveBundle } = bridgeWith(receipt)
    const repository = createLocalBundleRepository(bridge, {
      maxFiles: 2,
      maxFileBytes: 3,
      maxTotalBytes: 4,
    })

    const invalid = [
      { name: 'empty', files: [] },
      { name: '../escape', files: [{ path: 'a', content: 'a' }] },
      { name: 'x', files: [{ path: '../a', content: 'a' }] },
      { name: 'x', files: [{ path: 'a', content: 'a' }, { path: 'a', content: 'b' }] },
      { name: 'x', files: [{ path: 'a', content: '1234' }] },
      { name: 'x', files: [{ path: 'a', content: '123' }, { path: 'b', content: '12' }] },
      { name: 'x', files: [{ path: 'a', content: 'a' }, { path: 'b', content: 'b' }, { path: 'c', content: 'c' }] },
    ] as const

    for (const bundle of invalid) {
      expect((await repository.save(bundle)).ok).toBe(false)
    }
    expect(saveBundle).not.toHaveBeenCalled()
  })

  it('maps native rejection to Result error', async () => {
    const bridge = { saveBundle: vi.fn(async () => { throw new Error('target already exists') }) } as unknown as NativeBridge
    const result = await createLocalBundleRepository(bridge).save({
      name: 'starter',
      files: [{ path: 'package.json', content: '{}' }],
    })
    expect(result).toEqual({ ok: false, error: 'target already exists' })
  })
})
