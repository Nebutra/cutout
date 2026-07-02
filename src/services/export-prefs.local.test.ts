import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mem } = vi.hoisted(() => ({ mem: new Map<string, unknown>() }))

vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    async get<T>(key: string): Promise<T | undefined> {
      return mem.get(key) as T | undefined
    }
    async set(key: string, value: unknown): Promise<void> {
      mem.set(key, value)
    }
    async save(): Promise<void> {}
  },
}))

import {
  loadExportPrefs,
  setRememberDir,
  rememberLastDir,
  rememberedDir,
} from './export-prefs.local'

beforeEach(() => mem.clear())

describe('export-prefs.local', () => {
  it('defaults to remembering off', async () => {
    expect(await loadExportPrefs()).toEqual({ rememberDir: false })
  })

  it('toggles rememberDir and round-trips', async () => {
    await setRememberDir(true)
    expect(await loadExportPrefs()).toEqual({ rememberDir: true })
  })

  it('remembers the last dir only when enabled', async () => {
    // Off → not stored.
    await rememberLastDir('/a')
    expect((await loadExportPrefs()).lastDir).toBeUndefined()
    // On → stored.
    await setRememberDir(true)
    await rememberLastDir('/b')
    expect((await loadExportPrefs()).lastDir).toBe('/b')
  })

  it('rememberedDir returns the dir only when enabled', async () => {
    await setRememberDir(true)
    await rememberLastDir('/c')
    expect(await rememberedDir()).toBe('/c')
    await setRememberDir(false)
    expect(await rememberedDir()).toBeUndefined()
  })

  it('an invalid persisted blob degrades to defaults', async () => {
    mem.set('export.prefs', { rememberDir: 'yes' })
    expect(await loadExportPrefs()).toEqual({ rememberDir: false })
  })
})
