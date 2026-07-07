import { describe, expect, it } from 'vitest'
import type { PrototypePlan } from './prototype-plan'
import { createPrototypeAssetManifest } from './asset-manifest'

const plan: PrototypePlan = {
  version: 'prototype-plan.v0',
  product: {
    name: 'Atlas Store',
    summary: 'Multi-page merch storefront.',
    audience: 'Fans and collectors',
    primaryGoal: 'Buy limited items',
    platform: 'desktop web',
  },
  designSystem: {
    styleSummary: 'Bright retail UI with collectible character art.',
    palette: ['yellow', 'white', 'blue'],
    typography: 'Rounded sans',
    spacing: '8px grid',
    componentPrinciples: ['clear commerce hierarchy'],
    assetDirection: 'Product photos and banner art',
  },
  pages: [
    {
      id: 'home',
      name: 'Home',
      route: '/',
      purpose: 'Introduce featured merchandise.',
      viewport: { platform: 'desktop web', width: 1440, height: 1000, scroll: 'long-scroll' },
      regions: [
        {
          id: 'hero',
          name: 'Hero banner',
          role: 'entry',
          summary: 'Feature limited edition products.',
          complexity: 'high',
          decompositionStrategy: 'region-crop',
          assetRoute: 'direct-generate',
          assetOpportunities: ['banner art', 'mascot plush'],
        },
      ],
      overlays: [],
      states: [],
      interactions: [],
    },
    {
      id: 'products',
      name: 'Products',
      route: '/products',
      purpose: 'Browse product grid.',
      viewport: { platform: 'desktop web', width: 1440, height: 1000, scroll: 'long-scroll' },
      regions: [
        {
          id: 'grid',
          name: 'Product grid',
          role: 'browse',
          summary: 'Filterable grid of merch.',
          complexity: 'medium',
          decompositionStrategy: 'direct',
          assetRoute: 'board-cutout',
          assetOpportunities: ['product objects'],
        },
        {
          id: 'filters',
          name: 'Filters',
          role: 'control',
          summary: 'Code UI controls.',
          complexity: 'low',
          decompositionStrategy: 'direct',
          assetRoute: 'ignore-code-ui',
          assetOpportunities: ['filter tabs'],
        },
      ],
      overlays: [],
      states: [],
      interactions: [],
    },
  ],
  flows: [],
  humanLoop: { mode: 'continue', rationale: 'Specific enough.' },
}

describe('prototype asset manifest', () => {
  it('keeps routing and recommended filenames outside DESIGN.md', () => {
    const manifest = createPrototypeAssetManifest(plan, plan.pages)

    expect(manifest.version).toBe('asset-manifest.v0')
    expect(manifest.assets.map((asset) => asset.recommendedName)).toEqual([
      'home-banner-art',
      'home-mascot-plush',
      'products-product-objects',
    ])
    expect(manifest.assets.map((asset) => asset.assetRoute)).toEqual([
      'direct-generate',
      'direct-generate',
      'board-cutout',
    ])
    expect(manifest.assets.some((asset) => asset.regionName === 'Filters')).toBe(false)
  })
})
