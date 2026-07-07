import { describe, expect, it } from 'vitest'
import type { PrototypePlan } from './prototype-plan'
import {
  fallbackPrototypeSliceNames,
  isGenericSliceFilename,
} from './asset-names'

const plan: PrototypePlan = {
  version: 'prototype-plan.v0',
  product: {
    name: 'MoeMaid Cafe',
    summary: 'A themed cafe suite.',
    audience: 'Fans',
    primaryGoal: 'Book a table',
    platform: 'responsive web',
  },
  designSystem: {
    styleSummary: 'Kawaii hospitality.',
    palette: ['pink', 'cream'],
    typography: 'rounded sans',
    spacing: '8px',
    componentPrinciples: [],
    assetDirection: 'Dessert art and cafe ornaments.',
  },
  pages: [
    {
      id: 'welcome',
      name: 'Welcome / Experience',
      route: '/',
      purpose: 'Introduce the cafe.',
      viewport: { platform: 'web', width: 1440, height: 900, scroll: 'long-scroll' },
      regions: [
        {
          id: 'hero',
          name: 'Hero',
          role: 'entry',
          summary: 'A warm cafe hero.',
          complexity: 'high',
          decompositionStrategy: 'region-crop',
          assetRoute: 'direct-generate',
          assetOpportunities: ['maid cafe interior', 'heart bow sticker'],
        },
        {
          id: 'form',
          name: 'Reservation form',
          role: 'conversion',
          summary: 'Code UI form.',
          complexity: 'low',
          decompositionStrategy: 'direct',
          assetRoute: 'ignore-code-ui',
          assetOpportunities: ['input chrome'],
        },
      ],
      overlays: [],
      states: [],
      interactions: [],
    },
    {
      id: 'reservation',
      name: 'Reservation',
      route: '/reservation',
      purpose: 'Book a visit.',
      viewport: { platform: 'web', width: 1440, height: 900, scroll: 'single-screen' },
      regions: [
        {
          id: 'desserts',
          name: 'Desserts',
          role: 'content',
          summary: 'Dessert visuals.',
          complexity: 'medium',
          decompositionStrategy: 'direct',
          assetRoute: 'board-cutout',
          assetOpportunities: ['strawberry parfait', 'tea set'],
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

describe('prototype asset names', () => {
  it('recognizes generated placeholder filenames', () => {
    expect(isGenericSliceFilename('generated-sheet-01.png')).toBe(true)
    expect(isGenericSliceFilename('strawberry-parfait.png')).toBe(false)
  })

  it('uses scoped pages and asset opportunities for fallback names', () => {
    expect(fallbackPrototypeSliceNames(plan, plan.pages, 5)).toEqual([
      'welcome-experience-maid-cafe-interior',
      'welcome-experience-heart-bow-sticker',
      'reservation-strawberry-parfait',
      'reservation-tea-set',
      'visual-asset-5',
    ])
  })
})
