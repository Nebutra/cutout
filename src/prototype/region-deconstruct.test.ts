import { describe, expect, it, vi } from 'vitest'
import { ok, err } from '@/services/types'
import type { EditImageInput, GeneratedAsset } from '@/services/ai/types'
import type { PrototypePage, PrototypeRegion } from './prototype-plan'
import type { SliceInput } from '@/store/types'
import {
  regionBoardPrompt,
  regionNameContext,
  regionSlug,
  runRegionBreakdown,
  selectBoardCutoutRegions,
  type RegionBreakdownDeps,
} from './region-deconstruct'

function region(overrides: Partial<PrototypeRegion> & { id: string; name: string }): PrototypeRegion {
  return {
    role: 'content',
    summary: `${overrides.name} summary`,
    complexity: 'medium',
    decompositionStrategy: 'direct',
    assetRoute: 'board-cutout',
    assetOpportunities: [],
    ...overrides,
  } as PrototypeRegion
}

function page(regions: PrototypeRegion[]): PrototypePage {
  return {
    id: 'page-1',
    name: 'Landing',
    route: '/',
    purpose: 'test',
    viewport: { width: 1440, height: 1024, scroll: 'vertical' },
    regions,
    overlays: [],
    states: [],
    interactions: [],
  } as unknown as PrototypePage
}

const fakeBitmap = { width: 1024, height: 1024, close() {} } as unknown as ImageBitmap

function sliceInput(id: string, regionId: string): SliceInput {
  return {
    id,
    index: 0,
    box: { x: 0, y: 0, width: 10, height: 10 },
    blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
    width: 10,
    height: 10,
    regionId,
    pageId: 'page-1',
  }
}

function makeDeps(
  overrides: Partial<RegionBreakdownDeps> & {
    generateAsset?: () => ReturnType<RegionBreakdownDeps['generation']['editImage']>
  } = {},
): RegionBreakdownDeps {
  const asset: GeneratedAsset = { mediaType: 'image/png', bytes: new Uint8Array([137, 80, 78, 71]) }
  return {
    generation: {
      editImage: overrides.generateAsset ?? (async () => ok([asset])),
      generateImages: overrides.generateAsset ?? (async () => ok([asset])),
    },
    providers: {
      list: async () => [
        { id: 'p', kind: 'openai', label: 'x', defaultModel: 'm', enabled: true },
      ],
    },
    decode: async () => fakeBitmap,
    slice: async (_bitmap, regionId) => [sliceInput(`slice-${regionId}`, regionId)],
    ...overrides,
  }
}

const IMAGE = { providerId: 'p', model: 'gpt-image-1' }

describe('selectBoardCutoutRegions', () => {
  it('keeps only board-cutout regions, in order', () => {
    const p = page([
      region({ id: 'a', name: 'Hero', assetRoute: 'board-cutout' }),
      region({ id: 'b', name: 'Copy', assetRoute: 'ignore-code-ui' }),
      region({ id: 'c', name: 'Gallery', assetRoute: 'board-cutout' }),
      region({ id: 'd', name: 'Splash', assetRoute: 'direct-generate' }),
    ])
    expect(selectBoardCutoutRegions(p).map((r) => r.id)).toEqual(['a', 'c'])
  })
})

describe('regionBoardPrompt', () => {
  it('scopes the instruction to one region and forbids other regions', () => {
    const p = page([region({ id: 'a', name: 'Feature Grid', summary: 'a grid of cards', assetOpportunities: ['card', 'icon'] })])
    const prompt = regionBoardPrompt(p, p.regions[0]!)
    expect(prompt).toContain('Feature Grid')
    expect(prompt).toContain('a grid of cards')
    expect(prompt).toContain('card, icon')
    expect(prompt).toContain('Do NOT include assets from any other region')
    expect(prompt).toContain('#FFFFFF')
  })
})

describe('runRegionBreakdown', () => {
  it('generates + slices each board-cutout region and streams slices per region', async () => {
    const streamed: Array<{ regionId: string; count: number }> = []
    const p = page([
      region({ id: 'a', name: 'Hero' }),
      region({ id: 'b', name: 'Ignore', assetRoute: 'ignore-code-ui' }),
      region({ id: 'c', name: 'Gallery' }),
    ])
    const result = await runRegionBreakdown(makeDeps(), {
      page: p,
      pageBytes: new Uint8Array([1]),
      image: IMAGE,
      onRegionSliced: (regionId, slices) => streamed.push({ regionId, count: slices.length }),
    })
    expect(streamed).toEqual([
      { regionId: 'a', count: 1 },
      { regionId: 'c', count: 1 },
    ])
    expect(result).toEqual({ regionCount: 2, sliceCount: 2, failedRegionIds: [] })
  })

  it('isolates a per-region failure — other regions still stream', async () => {
    const streamed: string[] = []
    const errors: string[] = []
    const p = page([
      region({ id: 'a', name: 'Hero' }),
      region({ id: 'bad', name: 'Broken' }),
      region({ id: 'c', name: 'Gallery' }),
    ])
    const deps = makeDeps({
      slice: async (_bitmap, regionId) => {
        if (regionId === 'bad') throw new Error('CV blew up')
        return [sliceInput(`slice-${regionId}`, regionId)]
      },
    })
    const result = await runRegionBreakdown(deps, {
      page: p,
      pageBytes: new Uint8Array([1]),
      image: IMAGE,
      onRegionSliced: (regionId) => streamed.push(regionId),
      onRegionError: (regionId, message) => errors.push(`${regionId}:${message}`),
    })
    expect(streamed).toEqual(['a', 'c'])
    expect(errors).toEqual(['bad:CV blew up'])
    expect(result.failedRegionIds).toEqual(['bad'])
    expect(result.sliceCount).toBe(2)
  })

  it('uses the openai edit path (page attached as reference image)', async () => {
    const editImage = vi.fn(async (_input: EditImageInput) =>
      ok([{ mediaType: 'image/png', bytes: new Uint8Array([137]) } as GeneratedAsset]),
    )
    const deps = makeDeps()
    deps.generation.editImage = editImage
    await runRegionBreakdown(deps, {
      page: page([region({ id: 'a', name: 'Hero' })]),
      pageBytes: new Uint8Array([9, 9, 9]),
      referenceImages: [new Uint8Array([1, 1])],
      image: IMAGE,
      onRegionSliced: () => {},
    })
    expect(editImage).toHaveBeenCalledOnce()
    const call = editImage.mock.calls[0]![0]
    expect(call.images[0]).toEqual(new Uint8Array([9, 9, 9]))
    expect(call.images[1]).toEqual(new Uint8Array([1, 1]))
  })

  it('propagates the model error into failedRegionIds, not a throw', async () => {
    const deps = makeDeps({ generateAsset: async () => err('provider exploded') })
    const result = await runRegionBreakdown(deps, {
      page: page([region({ id: 'a', name: 'Hero' })]),
      pageBytes: new Uint8Array([1]),
      image: IMAGE,
      onRegionSliced: () => {},
    })
    expect(result.failedRegionIds).toEqual(['a'])
    expect(result.sliceCount).toBe(0)
  })

  it('names each region with region context and namespaces names by region slug', async () => {
    const contexts: string[] = []
    const named: Array<{ id: string; name: string }> = []
    const deps: RegionBreakdownDeps = {
      ...makeDeps(),
      nameRegion: async (_bytes, slices, context) => {
        contexts.push(context)
        return slices.map((s) => ({ id: s.id, name: 'cta-button' }))
      },
    }
    await runRegionBreakdown(deps, {
      page: page([region({ id: 'a', name: 'Hero Banner', summary: 'a big hero', assetOpportunities: ['button'] })]),
      pageBytes: new Uint8Array([1]),
      image: IMAGE,
      onRegionSliced: () => {},
      onRegionNamed: (renames) => named.push(...renames),
    })
    // The naming call was primed with the region's semantics.
    expect(contexts[0]).toContain('Hero Banner')
    expect(contexts[0]).toContain('a big hero')
    expect(contexts[0]).toContain('button')
    // Names are namespaced by region slug (reflects the page⊃region tree).
    expect(named).toEqual([{ id: 'slice-a', name: 'hero-banner-cta-button' }])
  })

  it('keeps naming best-effort — a naming failure does not drop the slices', async () => {
    const named: Array<{ id: string; name: string }> = []
    const errors: string[] = []
    const streamed: string[] = []
    const deps: RegionBreakdownDeps = {
      ...makeDeps(),
      nameRegion: async () => {
        throw new Error('vision timed out')
      },
    }
    const result = await runRegionBreakdown(deps, {
      page: page([region({ id: 'a', name: 'Hero' })]),
      pageBytes: new Uint8Array([1]),
      image: IMAGE,
      onRegionSliced: (regionId) => streamed.push(regionId),
      onRegionNamed: (renames) => named.push(...renames),
      onRegionError: (regionId, message) => errors.push(`${regionId}:${message}`),
    })
    expect(streamed).toEqual(['a']) // slices still streamed
    expect(named).toEqual([]) // names not applied
    expect(errors).toEqual(['a:naming: vision timed out'])
    expect(result.sliceCount).toBe(1) // slice count unaffected
  })
})

describe('regionSlug + regionNameContext', () => {
  it('slugifies a region name file-safely', () => {
    expect(regionSlug('Feature Grid!')).toBe('feature-grid')
    expect(regionSlug('  ')).toBe('region')
  })

  it('builds grounding from region semantics', () => {
    const r = region({ id: 'a', name: 'Nav', role: 'navigation', summary: 'top bar', assetOpportunities: ['logo', 'menu-icon'] })
    const context = regionNameContext(r)
    expect(context).toContain('Nav')
    expect(context).toContain('navigation')
    expect(context).toContain('top bar')
    expect(context).toContain('logo, menu-icon')
  })
})
