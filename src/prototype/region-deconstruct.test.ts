import { describe, expect, it, vi } from 'vitest'
import type { BoardDiagnostics } from '@/algorithm/boardDiagnostics'
import type { PipelineForegroundCoverage } from '@/algorithm/runPipeline'
import { ok, err } from '@/services/types'
import type { EditImageInput, GeneratedAsset } from '@/services/ai/types'
import type { PrototypePage, PrototypeRegion } from './prototype-plan'
import type { SliceInput } from '@/store/types'
import {
  pageTextFreeVariantPrompt,
  regionBoardPrompt,
  regionNameContext,
  regionSlug,
  runRegionBreakdown,
  selectBoardCutoutRegions,
  selectPagesWithBoardCutouts,
  type RegionBreakdownDeps,
  type RegionImageRoute,
} from './region-deconstruct'

function region(overrides: Partial<PrototypeRegion> & { id: string; name: string }): PrototypeRegion {
  return {
    role: 'content',
    summary: `${overrides.name} summary`,
    complexity: 'medium',
    decompositionStrategy: 'direct',
    assetRoute: 'board-cutout',
    assetOpportunities: ['reusable visual asset'],
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

const COMPLIANT_DIAGNOSTICS: BoardDiagnostics = {
  borderWhiteRatio: 1,
  whiteRatio: 0.9,
  compliant: true,
}

const COMPLETE_COVERAGE: PipelineForegroundCoverage = {
  totalForegroundPixelCount: 100,
  retainedForegroundPixelCount: 100,
  omittedForegroundPixelCount: 0,
  retainedRatio: 1,
}

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
    slice: async (_bitmap, regionId) => ({
      slices: [sliceInput(`slice-${regionId}`, regionId)],
      diagnostics: COMPLIANT_DIAGNOSTICS,
      coverage: COMPLETE_COVERAGE,
    }),
    ...overrides,
  }
}

const IMAGE = { providerId: 'p', model: 'gpt-image-1' }

describe('selectBoardCutoutRegions', () => {
  it('keeps only non-empty board-cutout regions, in order', () => {
    const p = page([
      region({ id: 'a', name: 'Hero', assetRoute: 'board-cutout' }),
      region({ id: 'b', name: 'Copy', assetRoute: 'ignore-code-ui' }),
      region({ id: 'c', name: 'Gallery', assetRoute: 'board-cutout' }),
      region({ id: 'd', name: 'Splash', assetRoute: 'direct-generate' }),
      region({ id: 'e', name: 'Empty board', assetRoute: 'board-cutout', assetOpportunities: [] }),
    ])
    expect(selectBoardCutoutRegions(p).map((r) => r.id)).toEqual(['a', 'c'])
  })
})

describe('selectPagesWithBoardCutouts', () => {
  it('keeps every planned page that contributes reusable material', () => {
    const first = page([region({ id: 'hero', name: 'Hero', assetRoute: 'board-cutout' })])
    const ignored = page([region({ id: 'ui', name: 'Chrome', assetRoute: 'ignore-code-ui' })])
    const later = { ...page([region({ id: 'gallery', name: 'Gallery', assetRoute: 'board-cutout' })]), id: 'later' }

    expect(selectPagesWithBoardCutouts([first, ignored, later]).map((candidate) => candidate.id))
      .toEqual([first.id, 'later'])
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
    expect(prompt).toContain(
      'Do NOT add any text labels, captions, numbering, or watermarks of your own.',
    )
    expect(prompt).toContain('#FFFFFF')
  })
})

describe('runRegionBreakdown', () => {
  it('bounds concurrent region generation without dropping work', async () => {
    let active = 0
    let maximum = 0
    const releases: Array<() => void> = []
    const deps = makeDeps({
      generateAsset: async () => {
        active += 1
        maximum = Math.max(maximum, active)
        await new Promise<void>((resolve) => releases.push(resolve))
        active -= 1
        return ok([{ mediaType: 'image/png', bytes: new Uint8Array([137]) }])
      },
    })
    const pending = runRegionBreakdown(deps, {
      page: page([
        region({ id: 'a', name: 'A' }),
        region({ id: 'b', name: 'B' }),
        region({ id: 'c', name: 'C' }),
      ]),
      pageBytes: new Uint8Array([1]),
      image: IMAGE,
      regionConcurrency: 2,
      onRegionSliced: () => {},
    })

    await vi.waitFor(() => expect(releases).toHaveLength(2))
    releases.shift()!()
    releases.shift()!()
    await vi.waitFor(() => expect(releases).toHaveLength(1))
    releases.shift()!()

    await expect(pending).resolves.toMatchObject({ regionCount: 3, sliceCount: 3 })
    expect(maximum).toBe(2)
  })

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
    expect(result).toEqual({
      regionCount: 2,
      sliceCount: 2,
      failedRegionIds: [],
      diagnosticsByRegion: { a: COMPLIANT_DIAGNOSTICS, c: COMPLIANT_DIAGNOSTICS },
    })
  })

  it('streams diagnostics per region (before slices) and records them in the result', async () => {
    const events: string[] = []
    const diagnostics: Array<{ regionId: string; d: BoardDiagnostics }> = []
    const nonCompliant: BoardDiagnostics = {
      borderWhiteRatio: 0.2,
      whiteRatio: 0.3,
      compliant: false,
    }
    const deps = makeDeps({
      slice: async (_bitmap, regionId) => ({
        slices: [sliceInput(`slice-${regionId}`, regionId)],
        diagnostics: regionId === 'c' ? nonCompliant : COMPLIANT_DIAGNOSTICS,
        coverage: COMPLETE_COVERAGE,
      }),
    })
    const result = await runRegionBreakdown(deps, {
      page: page([region({ id: 'a', name: 'Hero' }), region({ id: 'c', name: 'Gallery' })]),
      pageBytes: new Uint8Array([1]),
      image: IMAGE,
      onRegionDiagnostics: (regionId, d) => {
        events.push(`diagnostics:${regionId}`)
        diagnostics.push({ regionId, d })
      },
      onRegionSliced: (regionId) => events.push(`sliced:${regionId}`),
    })
    // Diagnostics stream before the region's slices, once per region.
    expect(events).toEqual(['diagnostics:a', 'sliced:a', 'diagnostics:c', 'sliced:c'])
    expect(diagnostics).toEqual([
      { regionId: 'a', d: COMPLIANT_DIAGNOSTICS },
      { regionId: 'c', d: nonCompliant },
    ])
    expect(result.diagnosticsByRegion).toEqual({ a: COMPLIANT_DIAGNOSTICS, c: nonCompliant })
    // Measurement only: a non-compliant board still slices normally.
    expect(result.sliceCount).toBe(2)
    expect(result.failedRegionIds).toEqual([])
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
        return {
          slices: [sliceInput(`slice-${regionId}`, regionId)],
          diagnostics: COMPLIANT_DIAGNOSTICS,
          coverage: COMPLETE_COVERAGE,
        }
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

  it('labels board decode failures without exposing generated bytes', async () => {
    const errors: string[] = []
    const deps = makeDeps({
      decode: async () => {
        throw new Error('unsupported image payload')
      },
    })

    const result = await runRegionBreakdown(deps, {
      page: page([region({ id: 'bad', name: 'Broken' })]),
      pageBytes: new Uint8Array([1]),
      image: IMAGE,
      onRegionSliced: () => {},
      onRegionError: (_regionId, message) => errors.push(message),
    })

    expect(result.failedRegionIds).toEqual(['bad'])
    expect(errors).toEqual(['Board decode failed: unsupported image payload'])
  })

  it('fails a region explicitly when CV produces zero candidates', async () => {
    const errors: string[] = []
    const onRegionSliced = vi.fn()
    const deps = makeDeps({
      slice: async () => ({
        slices: [],
        diagnostics: COMPLIANT_DIAGNOSTICS,
        coverage: COMPLETE_COVERAGE,
      }),
    })

    const result = await runRegionBreakdown(deps, {
      page: page([region({ id: 'empty', name: 'Empty' })]),
      pageBytes: new Uint8Array([1]),
      image: IMAGE,
      onRegionSliced,
      onRegionError: (_regionId, message) => errors.push(message),
    })

    expect(result.failedRegionIds).toEqual(['empty'])
    expect(result.sliceCount).toBe(0)
    expect(onRegionSliced).not.toHaveBeenCalled()
    expect(errors).toEqual(['Board slicing produced zero candidates.'])
  })

  it('retries only explicitly targeted regions', async () => {
    const streamed: string[] = []
    const result = await runRegionBreakdown(makeDeps(), {
      page: page([
        region({ id: 'hero', name: 'Hero' }),
        region({ id: 'gallery', name: 'Gallery' }),
      ]),
      pageBytes: new Uint8Array([1]),
      image: IMAGE,
      targetRegionIds: ['gallery'],
      onRegionSliced: (regionId) => streamed.push(regionId),
    })
    expect(streamed).toEqual(['gallery'])
    expect(result.regionCount).toBe(1)
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
      editSupported: true,
      onRegionSliced: () => {},
    })
    expect(editImage).toHaveBeenCalledOnce()
    const call = editImage.mock.calls[0]![0]
    expect(call.images[0]).toEqual(new Uint8Array([9, 9, 9]))
    expect(call.images[1]).toEqual(new Uint8Array([1, 1]))
  })

  it('uses the same reference-conditioned edit path for CC Switch', async () => {
    const editImage = vi.fn(async (_input: EditImageInput) =>
      ok([{ mediaType: 'image/png', bytes: new Uint8Array([137]) } as GeneratedAsset]),
    )
    const generateImages = vi.fn(async () =>
      ok([{ mediaType: 'image/png', bytes: new Uint8Array([137]) } as GeneratedAsset]),
    )
    const deps = makeDeps({
      providers: {
        list: async () => [
          { id: 'p', kind: 'cc-switch', label: 'CC Switch', defaultModel: 'm', enabled: true },
        ],
      },
    })
    deps.generation.editImage = editImage
    deps.generation.generateImages = generateImages

    await runRegionBreakdown(deps, {
      page: page([region({ id: 'a', name: 'Hero' })]),
      pageBytes: new Uint8Array([9, 9, 9]),
      referenceImages: [new Uint8Array([1, 1])],
      image: IMAGE,
      editSupported: true,
      onRegionSliced: () => {},
    })

    expect(editImage).toHaveBeenCalledOnce()
    expect(generateImages).not.toHaveBeenCalled()
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

  it('retries a transient board transport once but not an output failure', async () => {
    let transientCalls = 0
    const transient = makeDeps({
      generateAsset: async () => {
        transientCalls += 1
        return transientCalls === 1
          ? err('HTTP 502 bad gateway')
          : ok([{ mediaType: 'image/png', bytes: new Uint8Array([137]) }])
      },
    })
    await expect(runRegionBreakdown(transient, {
      page: page([region({ id: 'a', name: 'Hero' })]),
      pageBytes: new Uint8Array([1]),
      image: IMAGE,
      transientRetries: 1,
      onRegionSliced: () => {},
    })).resolves.toMatchObject({ failedRegionIds: [], sliceCount: 1 })
    expect(transientCalls).toBe(2)

    let outputCalls = 0
    const outputFailure = makeDeps({
      generateAsset: async () => {
        outputCalls += 1
        return err('The model returned no board image for this region.')
      },
    })
    await expect(runRegionBreakdown(outputFailure, {
      page: page([region({ id: 'a', name: 'Hero' })]),
      pageBytes: new Uint8Array([1]),
      image: IMAGE,
      transientRetries: 1,
      onRegionSliced: () => {},
    })).resolves.toMatchObject({ failedRegionIds: ['a'], sliceCount: 0 })
    expect(outputCalls).toBe(1)
  })

  it('re-resolves the exact route for a transient retry and reviews the successful route', async () => {
    const firstRoute: RegionImageRoute = {
      assignment: { providerId: 'pressured', model: 'edit-a' },
      operation: 'image-edit',
    }
    const recoveredRoute: RegionImageRoute = {
      assignment: { providerId: 'healthy', model: 'generate-b' },
      operation: 'image-generation',
    }
    const routes = [firstRoute, recoveredRoute]
    const editImage = vi.fn(async (_input: EditImageInput) => err('HTTP 502 bad gateway'))
    const generateImages = vi.fn(async (
      _input: Parameters<RegionBreakdownDeps['generation']['generateImages']>[0],
    ) =>
      ok([{ mediaType: 'image/png' as const, bytes: new Uint8Array([137]) }]),
    )
    const reviewedRoutes: RegionImageRoute[] = []
    const publishedRoutes: RegionImageRoute[] = []
    const deps: RegionBreakdownDeps = {
      ...makeDeps(),
      generation: { editImage, generateImages },
      reviewBoard: async (_bytes, _checklist, _signal, route) => {
        reviewedRoutes.push(route)
        return { pass: true, failures: [] }
      },
    }

    await expect(runRegionBreakdown(deps, {
      page: page([region({ id: 'a', name: 'Hero' })]),
      pageBytes: new Uint8Array([1]),
      image: IMAGE,
      transientRetries: 1,
      resolveImageRoute: () => routes.shift()!,
      onRegionSliced: (_regionId, _slices, evidence) => {
        publishedRoutes.push(evidence.generationRoute)
      },
    })).resolves.toMatchObject({ failedRegionIds: [], sliceCount: 1 })

    expect(editImage).toHaveBeenCalledOnce()
    expect(editImage.mock.calls[0]![0]).toMatchObject({
      providerId: 'pressured',
      model: 'edit-a',
    })
    expect(generateImages).toHaveBeenCalledOnce()
    expect(generateImages.mock.calls[0]![0]).toMatchObject({
      providerId: 'healthy',
      model: 'generate-b',
    })
    expect(reviewedRoutes).toEqual([recoveredRoute])
    expect(publishedRoutes).toEqual([recoveredRoute])
  })

  it('dispatches a Google edit strategy through multimodal generation with every reference', async () => {
    const route: RegionImageRoute = {
      assignment: { providerId: 'google', model: 'gemini-image' },
      operation: 'image-edit',
      transportStrategy: 'google-multimodal-generate',
    }
    const editImage = vi.fn(async () => err('Google multipart edit is unavailable.'))
    const generateImages = vi.fn(async (
      _input: Parameters<RegionBreakdownDeps['generation']['generateImages']>[0],
    ) =>
      ok([{ mediaType: 'image/png' as const, bytes: new Uint8Array([137]) }]),
    )
    const publishedRoutes: RegionImageRoute[] = []

    await expect(runRegionBreakdown({
      ...makeDeps(),
      generation: { editImage, generateImages },
    }, {
      page: page([region({ id: 'a', name: 'Hero' })]),
      pageBytes: new Uint8Array([9]),
      referenceImages: [new Uint8Array([8]), new Uint8Array([7])],
      image: route.assignment,
      resolveImageRoute: () => route,
      onRegionSliced: (_regionId, _slices, evidence) => {
        publishedRoutes.push(evidence.generationRoute)
      },
    })).resolves.toMatchObject({ failedRegionIds: [], sliceCount: 1 })

    expect(editImage).not.toHaveBeenCalled()
    expect(generateImages).toHaveBeenCalledOnce()
    expect(generateImages.mock.calls[0]![0].input).toEqual([
      expect.objectContaining({ type: 'text' }),
      { type: 'image', image: new Uint8Array([9]) },
      { type: 'image', image: new Uint8Array([8]) },
      { type: 'image', image: new Uint8Array([7]) },
    ])
    expect(publishedRoutes).toEqual([route])
  })

  it('re-resolves the exact route for each QA regeneration', async () => {
    const firstRoute: RegionImageRoute = {
      assignment: { providerId: 'provider-a', model: 'edit-a' },
      operation: 'image-edit',
    }
    const secondRoute: RegionImageRoute = {
      assignment: { providerId: 'provider-b', model: 'edit-b' },
      operation: 'image-edit',
    }
    const routes = [firstRoute, secondRoute]
    const editImage = vi.fn(async (_input: EditImageInput) =>
      ok([{ mediaType: 'image/png' as const, bytes: new Uint8Array([137]) }]),
    )
    const reviewedRoutes: RegionImageRoute[] = []
    const deps: RegionBreakdownDeps = {
      ...makeDeps(),
      generation: { ...makeDeps().generation, editImage },
      reviewBoard: async (_bytes, _checklist, _signal, route) => {
        reviewedRoutes.push(route)
        return reviewedRoutes.length === 1
          ? { pass: false, failures: ['missing declared asset'] }
          : { pass: true, failures: [] }
      },
    }

    await expect(runRegionBreakdown(deps, {
      page: page([region({ id: 'a', name: 'Hero' })]),
      pageBytes: new Uint8Array([1]),
      image: IMAGE,
      transientRetries: 0,
      qaMaxRetries: 1,
      resolveImageRoute: () => routes.shift()!,
      onRegionSliced: () => {},
    })).resolves.toMatchObject({ failedRegionIds: [], sliceCount: 1 })

    expect(editImage.mock.calls.map(([input]) => [input.providerId, input.model])).toEqual([
      ['provider-a', 'edit-a'],
      ['provider-b', 'edit-b'],
    ])
    expect(reviewedRoutes).toEqual([firstRoute, secondRoute])
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
    await vi.waitFor(() => expect(named).toHaveLength(1))
    // The naming call was primed with the region's semantics.
    expect(contexts[0]).toContain('Hero Banner')
    expect(contexts[0]).toContain('a big hero')
    expect(contexts[0]).toContain('button')
    // Names are namespaced by region slug (reflects the page⊃region tree).
    expect(named).toEqual([{ id: 'slice-a', name: 'hero-banner-cta-button' }])
  })

  it('closes each region board bitmap after slicing (no leak)', async () => {
    const close = vi.fn()
    const deps: RegionBreakdownDeps = {
      ...makeDeps(),
      decode: async () => ({ width: 1024, height: 1024, close }) as unknown as ImageBitmap,
    }
    await runRegionBreakdown(deps, {
      page: page([region({ id: 'a', name: 'Hero' }), region({ id: 'c', name: 'Gallery' })]),
      pageBytes: new Uint8Array([1]),
      image: IMAGE,
      onRegionSliced: () => {},
    })
    expect(close).toHaveBeenCalledTimes(2)
  })

  it('swallows a naming rejection on abort — not reported as a region error, no throw', async () => {
    const controller = new AbortController()
    const errors: string[] = []
    const streamed: string[] = []
    const deps: RegionBreakdownDeps = {
      ...makeDeps(),
      nameRegion: async () => {
        controller.abort()
        throw new Error('aborted mid-naming')
      },
    }
    await expect(
      runRegionBreakdown(deps, {
        page: page([region({ id: 'a', name: 'Hero' })]),
        pageBytes: new Uint8Array([1]),
        image: IMAGE,
        signal: controller.signal,
        onRegionSliced: (regionId) => streamed.push(regionId),
        onRegionNamed: () => {},
        onRegionError: (_regionId, message) => errors.push(message),
      }),
    ).resolves.toBeDefined()
    expect(streamed).toEqual(['a']) // slice still streamed
    expect(errors.filter((m) => m.startsWith('naming'))).toEqual([]) // abort swallowed
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
    await vi.waitFor(() => expect(errors).toHaveLength(1))
    expect(streamed).toEqual(['a']) // slices still streamed
    expect(named).toEqual([]) // names not applied
    expect(errors).toEqual(['a:naming: vision timed out'])
    expect(result.sliceCount).toBe(1) // slice count unaffected
  })

  it('settles required slices when optional naming never resolves', async () => {
    let namingSignal: AbortSignal | undefined
    const errors: string[] = []
    const deps: RegionBreakdownDeps = {
      ...makeDeps(),
      nameRegion: async (_bytes, _slices, _context, signal) => {
        namingSignal = signal
        return new Promise(() => {})
      },
    }

    const result = await runRegionBreakdown(deps, {
      page: page([region({ id: 'a', name: 'Hero' })]),
      pageBytes: new Uint8Array([1]),
      image: IMAGE,
      namingTimeoutMs: 5,
      onRegionSliced: () => {},
      onRegionNamed: () => {},
      onRegionError: (_regionId, message) => errors.push(message),
    })

    expect(result).toMatchObject({ regionCount: 1, sliceCount: 1, failedRegionIds: [] })
    await vi.waitFor(() => expect(namingSignal?.aborted).toBe(true))
    expect(errors).toEqual(['naming: Optional slice naming exceeded its deadline.'])
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

describe('pageTextFreeVariantPrompt + textFreeSource', () => {
  it('asks for an exact reproduction with all text replaced by placeholder bars', () => {
    const p = page([region({ id: 'a', name: 'Hero' })])
    const prompt = pageTextFreeVariantPrompt(p)
    expect(prompt).toContain('Landing')
    expect(prompt).toContain('remove ALL text')
    expect(prompt).toContain('placeholder bar')
    expect(prompt).toContain('Do NOT restyle')
  })

  it('derives the variant once and feeds it to every region board', async () => {
    const variantBytes = new Uint8Array([9, 9, 9])
    const boardSources: Uint8Array[] = []
    let calls = 0
    const deps = makeDeps({
      generateAsset: undefined,
    })
    deps.generation.editImage = async (input: EditImageInput) => {
      calls += 1
      if (calls === 1) {
        // First call is the text-free variant derived from the page bytes.
        expect(input.prompt).toContain('remove ALL text')
        return ok([{ mediaType: 'image/png', bytes: variantBytes }])
      }
      boardSources.push(input.images[0]!)
      return ok([{ mediaType: 'image/png', bytes: new Uint8Array([1]) }])
    }
    const result = await runRegionBreakdown(deps, {
      page: page([region({ id: 'a', name: 'Hero' }), region({ id: 'c', name: 'Gallery' })]),
      pageBytes: new Uint8Array([1]),
      image: IMAGE,
      editSupported: true,
      textFreeSource: true,
      onRegionSliced: () => {},
    })
    expect(result.regionCount).toBe(2)
    expect(boardSources).toEqual([variantBytes, variantBytes])
  })

  it('falls back to the original page bytes when the variant fails', async () => {
    const pageBytes = new Uint8Array([7])
    const boardSources: Uint8Array[] = []
    const notices: string[] = []
    let calls = 0
    const deps = makeDeps()
    deps.generation.editImage = async (input: EditImageInput) => {
      calls += 1
      if (calls === 1) return err('variant model down')
      boardSources.push(input.images[0]!)
      return ok([{ mediaType: 'image/png', bytes: new Uint8Array([1]) }])
    }
    const result = await runRegionBreakdown(deps, {
      page: page([region({ id: 'a', name: 'Hero' })]),
      pageBytes,
      image: IMAGE,
      editSupported: true,
      textFreeSource: true,
      onTextFreeSourceError: (message) => notices.push(message),
      onRegionSliced: () => {},
    })
    expect(result.failedRegionIds).toEqual([])
    expect(boardSources).toEqual([pageBytes])
    expect(notices).toEqual(['variant model down'])
  })
})
