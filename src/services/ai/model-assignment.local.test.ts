import { describe, it, expect, beforeEach, vi } from 'vitest'

// In-memory backing for a mocked LazyStore. `vi.hoisted` so the factory below
// (hoisted above imports) can safely reference it.
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
  loadAssignments,
  loadRuntimeCapabilityBindings,
  setAssignment,
  clearAssignment,
} from './model-assignment.local'

beforeEach(() => {
  mem.clear()
  vi.unstubAllGlobals()
})

describe('model-assignment.local', () => {
  it('empty store resolves to {}', async () => {
    expect(await loadAssignments()).toEqual({})
  })

  it('set then load round-trips a slot', async () => {
    await setAssignment('chat', { providerId: 'p1', model: 'm1' })
    expect(await loadAssignments()).toEqual({
      chat: { providerId: 'p1', model: 'm1' },
    })
  })

  it('keeps the other slot when setting one', async () => {
    await setAssignment('chat', { providerId: 'p1', model: 'm1' })
    await setAssignment('image', { providerId: 'p2', model: 'm2' })
    expect(await loadAssignments()).toEqual({
      chat: { providerId: 'p1', model: 'm1' },
      image: { providerId: 'p2', model: 'm2' },
    })
  })

  it('an invalid persisted blob degrades to {}', async () => {
    mem.set('ai.capabilityBindings', {
      version: 'model-assignments.v2',
      bindings: { text: { bogus: true } },
    })
    expect(await loadAssignments()).toEqual({})
  })

  it('clear removes only the named slot', async () => {
    await setAssignment('chat', { providerId: 'p1', model: 'm1' })
    await setAssignment('image', { providerId: 'p2', model: 'm2' })
    await clearAssignment('chat')
    expect(await loadAssignments()).toEqual({
      image: { providerId: 'p2', model: 'm2' },
    })
  })

  it('uses the query projection only when the native store is unavailable', async () => {
    const projection = {
      version: 'model-assignments.v2' as const,
      bindings: { text: { providerId: 'browser', model: 'browser-model' } },
      descriptors: [],
    }
    mem.set('ai.capabilityBindings', {
      version: 'model-assignments.v2',
      bindings: { text: { providerId: 'native', model: 'native-model' } },
      descriptors: [],
    })

    expect(await loadRuntimeCapabilityBindings(projection)).toEqual(projection)

    vi.stubGlobal('__TAURI_INTERNALS__', { invoke: vi.fn() })
    expect(await loadRuntimeCapabilityBindings(projection)).toEqual({
      version: 'model-assignments.v2',
      bindings: { text: { providerId: 'native', model: 'native-model' } },
      descriptors: [],
    })
  })
})
