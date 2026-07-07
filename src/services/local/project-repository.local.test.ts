import { describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import {
  createEmptyProjectRecord,
  createLocalProjectRepository,
} from './project-repository.local'

const pngBlob = (byte = 1) =>
  new Blob([new Uint8Array([byte])], { type: 'image/png' })

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function makeRepo() {
  return createLocalProjectRepository({ idb: new IDBFactory() })
}

describe('project-repository.local', () => {
  it('saves, lists newest-first, loads, and removes projects', async () => {
    const repo = makeRepo()
    const first = {
      ...createEmptyProjectRecord(100),
      name: 'First project',
      brief: 'first',
      updatedAt: Date.now(),
      thumbnail: pngBlob(1),
    }
    await sleep(5)
    const second = {
      ...createEmptyProjectRecord(200),
      name: 'Second project',
      brief: 'second',
      updatedAt: Date.now(),
      assetCount: 2,
      status: 'Ready' as const,
      thumbnail: pngBlob(2),
    }

    expect((await repo.save(first)).ok).toBe(true)
    expect((await repo.save(second)).ok).toBe(true)

    const listed = await repo.list()
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    expect(listed.data.map((project) => project.name)).toEqual([
      'Second project',
      'First project',
    ])
    expect(listed.data[0].assetCount).toBe(2)

    const loaded = await repo.load(first.id)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.data.brief).toBe('first')
    expect(loaded.data.thumbnail).toBeDefined()

    expect((await repo.remove(first.id)).ok).toBe(true)
    const after = await repo.list()
    expect(after.ok).toBe(true)
    if (after.ok) expect(after.data).toHaveLength(1)
  })
})
