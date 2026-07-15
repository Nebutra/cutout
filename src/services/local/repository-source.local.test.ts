// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { NativeBridge } from '@/platform/native'
import { createLocalRepositorySourceService } from './repository-source.local'

describe('repository source service', () => {
  it('is unavailable in a browser host and does not invent a directory scan', async () => {
    const bridge = {} as NativeBridge
    const service = createLocalRepositorySourceService(bridge)
    expect(service.nativeAvailable).toBe(false)
    await expect(service.selectAndScan()).resolves.toEqual({ ok: false, error: 'Native repository scanning is unavailable in this host.' })
  })

  it('delegates only to the native metadata scanner in Tauri', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true })
    const scanRepository = vi.fn().mockResolvedValue({ canceled: false, label: 'repo', entries: [], frameworkHints: [], excluded: { symbolicLink: 0, secretPath: 0, secretContent: 0, ignoredDirectory: 0, binary: 0, oversized: 0, unsupported: 0 } })
    const service = createLocalRepositorySourceService({ scanRepository } as unknown as NativeBridge)
    expect(service.nativeAvailable).toBe(true)
    expect(await service.selectAndScan()).toMatchObject({ ok: true, data: { label: 'repo' } })
    expect(scanRepository).toHaveBeenCalledOnce()
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
  })
})
