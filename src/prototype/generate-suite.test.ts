import { describe, expect, it } from 'vitest'
import type { PrototypePlan } from './prototype-plan'
import {
  pagesForScope,
  prototypeBoardExtractionBrief,
  prototypeDesignMarkdown,
  prototypeDesignMarkdownSynthesisSystem,
  prototypeDesignSystemPrompt,
  prototypePagePrompt,
} from './generate-suite'

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
      interactions: [
        {
          id: 'open-products',
          label: 'Shop products',
          trigger: 'click',
          sourceSectionId: 'hero',
          sourceElement: 'primary CTA',
          intent: 'Browse the catalog.',
          action: { type: 'navigate', targetPageId: 'products' },
        },
      ],
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
      ],
      overlays: [],
      states: [],
      interactions: [],
    },
    {
      id: 'about',
      name: 'About',
      route: '/about',
      purpose: 'Brand story.',
      viewport: { platform: 'desktop web', width: 1440, height: 900, scroll: 'single-screen' },
      regions: [
        {
          id: 'story',
          name: 'Story',
          role: 'trust',
          summary: 'Creator story.',
          complexity: 'low',
          decompositionStrategy: 'direct',
          assetRoute: 'ignore-code-ui',
          assetOpportunities: [],
        },
      ],
      overlays: [],
      states: [],
      interactions: [],
    },
  ],
  flows: [
    {
      id: 'shopping',
      name: 'Shopping',
      goal: 'Browse products.',
      startPageId: 'home',
      steps: [{ fromPageId: 'home', interactionId: 'open-products', toPageId: 'products' }],
    },
  ],
  humanLoop: {
    mode: 'continue',
    rationale: 'The commerce plan is specific enough to proceed.',
  },
}

describe('prototype suite generation helpers', () => {
  it('selects only reachable primary-flow pages for the lean scope', () => {
    expect(pagesForScope(plan, 'primary-flow').map((page) => page.id)).toEqual([
      'home',
      'products',
    ])
  })

  it('keeps all planned pages for the full scope', () => {
    expect(pagesForScope(plan, 'full-plan').map((page) => page.id)).toEqual([
      'home',
      'products',
      'about',
    ])
  })

  it('composes a page-specific prompt with shared design system and interactions', () => {
    const prompt = prototypePagePrompt(plan, plan.pages[0])

    expect(prompt).toContain('Generate exactly ONE high-fidelity prototype screen')
    expect(prompt).toContain('Shared design system')
    expect(prompt).toContain('Current page: Home')
    expect(prompt).toContain('Hero banner')
    expect(prompt).toContain('Asset route: direct-generate')
    expect(prompt).toContain('navigate to products')
    expect(prompt).not.toContain('Current page: Products')
  })

  it('injects imported DESIGN.md into page prompts as higher-priority context', () => {
    const prompt = prototypePagePrompt(
      plan,
      plan.pages[0],
      '---\nversion: alpha\nname: Imported\n---\n# Imported\nUse sharp editorial contrast.',
    )

    expect(prompt).toContain('Imported DESIGN.md must be treated as the higher-priority design contract')
    expect(prompt).toContain('Use sharp editorial contrast')
  })

  it('composes a DESIGN.md-compatible design-system document', () => {
    const designMd = prototypeDesignMarkdown(plan)

    expect(designMd).toContain('---')
    expect(designMd).toContain('version: alpha')
    expect(designMd).toContain('source: planner-design-contract')
    expect(designMd).toContain('colors:')
    expect(designMd).toContain('typography:')
    expect(designMd).toContain('spacing:')
    expect(designMd).toContain('components:')
    expect(designMd).toContain('planner-authored visual contract')
    expect(designMd).toContain('# Overview')
    expect(designMd).toContain("## Do's and Don'ts")
    expect(designMd).not.toContain('## Asset Routing')
    expect(designMd).not.toContain('direct-generate')
    expect(designMd).not.toContain('board-cutout')
    expect(designMd).not.toContain('generated-sheet')
    expect(designMd).not.toContain('button-primary')
  })

  it('preserves imported DESIGN.md frontmatter and appends only design context', () => {
    const designMd = prototypeDesignMarkdown(
      plan,
      '---\nversion: alpha\nname: Imported\ncolors:\n  primary: "#0055ff"\n---\n# Imported\nFollow the external system.',
    )

    expect(designMd).toContain('name: Imported')
    expect(designMd).toContain('primary: "#0055ff"')
    expect(designMd).toContain('# Imported DESIGN.md')
    expect(designMd).toContain('Follow the external system.')
    expect(designMd).toContain('# Cutout Design Addendum')
    expect(designMd).not.toContain('## Asset Routing')
    expect(designMd).not.toContain('direct-generate')
    expect(designMd).not.toContain('board-cutout')
  })

  it('composes a visual design-system prompt from the DESIGN.md source', () => {
    const prompt = prototypeDesignSystemPrompt(plan)

    expect(prompt).toContain('professional design-system reference image')
    expect(prompt).toContain('Agent-readable DESIGN.md source of truth')
    expect(prompt).toContain('version: alpha')
    expect(prompt).toContain('Scene-driven reference strategy')
    expect(prompt).toContain('Platform conventions to honor')
    expect(prompt).not.toContain('Direct-generation asset language')
    expect(prompt).not.toContain('Board-cutout asset language')
    expect(prompt).not.toContain('button states, input fields')
  })

  it('keeps image-grounded DESIGN.md synthesis design-only', () => {
    const system = prototypeDesignMarkdownSynthesisSystem(plan)

    expect(system).toContain('Do not include asset routing')
    expect(system).not.toContain('Asset routing addendum')
    expect(system).not.toContain('Home / Hero banner: direct-generate')
    expect(system).not.toContain('Products / Product grid: board-cutout')
  })

  it('composes a board extraction brief that separates board and direct routes', () => {
    const brief = prototypeBoardExtractionBrief(plan, plan.pages.slice(0, 2), 'toy store')

    expect(brief).toContain('Do NOT route the entire UI through the board')
    expect(brief).toContain('Asset manifest JSON')
    expect(brief).toContain('"version": "asset-manifest.v0"')
    expect(brief).toContain('"recommendedName": "home-banner-art"')
    expect(brief).toContain('"assetRoute": "board-cutout"')
    expect(brief).toContain('Board-cutout candidates to prioritize')
    expect(brief).toContain('Products / Product grid')
    expect(brief).toContain('Direct-generate candidates to avoid board-packing')
    expect(brief).toContain('Home / Hero banner')
    expect(brief).toContain('rounded or masked UI frame')
    expect(brief).toContain('do not clip off small attached ornaments')
    expect(brief).not.toContain('About / Story')
  })
})
