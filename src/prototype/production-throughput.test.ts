import { describe, expect, it } from 'vitest'
import type { PrototypePage } from './prototype-plan'
import { compilePrototypeImageRequestBudget } from './production-throughput'

function page(
  id: string,
  route: 'board-cutout' | 'direct-generate' | 'ignore-code-ui',
  materials: readonly string[],
): PrototypePage {
  return {
    id,
    name: id,
    route: `/${id}`,
    purpose: id,
    viewport: {
      platform: 'responsive web app',
      width: 1440,
      height: 960,
      scroll: 'single-screen',
    },
    regions: [{
      id: `${id}-assets`,
      name: 'Reusable assets',
      role: 'content',
      summary: 'Reusable visual assets.',
      complexity: 'medium',
      decompositionStrategy: 'region-crop',
      assetRoute: route,
      assetOpportunities: [...materials],
    }],
    overlays: [],
    states: [],
    interactions: [],
  }
}

function withAdditionalBoardGroup(
  source: PrototypePage,
  id: string,
  materials: readonly string[],
): PrototypePage {
  const template = source.regions[0]!
  return {
    ...source,
    regions: [
      ...source.regions,
      {
        ...template,
        id,
        name: 'Second reusable asset family',
        assetRoute: 'board-cutout',
        assetOpportunities: [...materials],
      },
    ],
  }
}

describe('prototype paid-image budget', () => {
  it('derives calls from heterogeneous Agent-authored page material scopes', () => {
    const budget = compilePrototypeImageRequestBudget({
      designSystemCalls: 2,
      suites: [
        { pages: [
          withAdditionalBoardGroup(
            page('visual', 'board-cutout', ['destination cover', 'map texture']),
            'visual-badges',
            ['status badge'],
          ),
          page('settings', 'ignore-code-ui', []),
        ] },
        { pages: [page('campaign', 'direct-generate', ['hero artwork', 'poster', 'social cover'])] },
      ],
    })

    expect(budget).toEqual({
      designSystemCalls: 2,
      pageCalls: 3,
      boardCalls: 2,
      directAssetCalls: 3,
      totalCalls: 10,
    })
  })

  it('counts explicit standalone assets without turning their count into a page default', () => {
    expect(compilePrototypeImageRequestBudget({
      designSystemCalls: 1,
      suites: [{ pages: [page('art', 'direct-generate', ['hero artwork', 'mascot', 'poster'])] }],
    })).toMatchObject({
      pageCalls: 1,
      boardCalls: 0,
      directAssetCalls: 3,
      totalCalls: 5,
    })
  })
})
