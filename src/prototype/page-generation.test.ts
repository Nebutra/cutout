import { describe, expect, it } from 'vitest'
import { generatePrototypePageSet } from './page-generation'

interface Page {
  readonly id: string
  readonly route: string
}

interface Artifact {
  readonly page: Page
  readonly bytes: Uint8Array
}

const pages: readonly Page[] = [
  { id: 'home', route: '/' },
  { id: 'catalog', route: '/catalog' },
  { id: 'account', route: '/account' },
  { id: 'settings', route: '/settings' },
]

function artifact(page: Page): Artifact {
  return { page, bytes: new TextEncoder().encode(page.id) }
}

describe('generatePrototypePageSet', () => {
  it('generates every route with one stable anchor and bounded concurrency', async () => {
    const predecessors = new Map<string, string | undefined>()
    const progress: string[][] = []
    let active = 0
    let maxActive = 0
    const result = await generatePrototypePageSet({
      pages,
      mode: 'anchor-parallel',
      concurrency: 2,
      async generate(page, predecessor) {
        predecessors.set(page.id, predecessor?.page.id)
        active += 1
        maxActive = Math.max(maxActive, active)
        await Promise.resolve()
        active -= 1
        return artifact(page)
      },
      onProgress: (artifacts) => progress.push(artifacts.map((item) => item.page.id)),
    })

    expect(result.map((item) => item.page.id)).toEqual(pages.map((page) => page.id))
    expect(predecessors).toEqual(new Map([
      ['home', undefined],
      ['catalog', 'home'],
      ['account', 'home'],
      ['settings', 'home'],
    ]))
    expect(maxActive).toBe(2)
    expect(progress[0]).toEqual(['home'])
    expect(progress.at(-1)).toEqual(['home', 'catalog', 'account', 'settings'])
  })

  it('uses the preceding planned page in serial mode', async () => {
    const predecessors: Array<string | undefined> = []
    await generatePrototypePageSet({
      pages: pages.slice(0, 3),
      mode: 'serial',
      concurrency: 2,
      async generate(page, predecessor) {
        predecessors.push(predecessor?.page.id)
        return artifact(page)
      },
    })
    expect(predecessors).toEqual([undefined, 'home', 'catalog'])
  })

  it('reuses an existing first route as the visual anchor', async () => {
    const generated: string[] = []
    const result = await generatePrototypePageSet({
      pages,
      existingArtifacts: [artifact(pages[0]!)],
      mode: 'anchor-parallel',
      concurrency: 2,
      async generate(page, predecessor) {
        expect(predecessor?.page.id).toBe('home')
        generated.push(page.id)
        return artifact(page)
      },
    })
    expect(generated).toEqual(['catalog', 'account', 'settings'])
    expect(result).toHaveLength(4)
  })

  it('fails closed when a generator returns the wrong route identity', async () => {
    await expect(generatePrototypePageSet({
      pages: pages.slice(0, 2),
      mode: 'anchor-parallel',
      concurrency: 2,
      generate: async () => artifact(pages[1]!),
    })).rejects.toThrow('returned page "catalog" for planned page "home"')
  })
})
