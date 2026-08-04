import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  generatedPrototypePlanningMaterialSchema,
  generatedPrototypePlanSchema,
  generatedPrototypePlanningSeedSchema,
  prototypePlanningSeedSchema,
  prototypePlanSchema,
  validatePrototypePlan,
  type PrototypePlan,
} from './prototype-plan'
import { currentPrototypeExploration, currentPrototypeReviewDocument } from './prototype-plan.test-fixture'

const validPlan: PrototypePlan = {
  version: 'prototype-plan.v0',
  product: {
    name: 'Nebula SaaS',
    summary: 'Analytics workspace for revenue teams.',
    audience: 'B2B operators',
    primaryGoal: 'Help teams compare plans and start a trial.',
    platform: 'responsive web SaaS',
  },
  designSystem: {
    styleSummary: 'Quiet enterprise UI with luminous data accents.',
    palette: ['ink', 'white', 'cyan'],
    typography: 'Geist-like grotesk with compact dashboard labels.',
    spacing: '8px base grid with dense dashboard surfaces.',
    componentPrinciples: ['calm hierarchy', 'consistent cards'],
    assetDirection: 'Only generate brand marks and data illustrations.',
    exploration: currentPrototypeExploration,
  },
  pages: [
    {
      id: 'home',
      name: 'Home',
      route: '/',
      purpose: 'Explain the product and route visitors to pricing.',
      viewport: {
        platform: 'desktop web',
        width: 1440,
        height: 1100,
        scroll: 'long-scroll',
      },
      regions: [
        {
          id: 'hero',
          name: 'Hero',
          role: 'conversion entry',
          summary: 'Headline, proof, primary CTA, and product preview.',
          complexity: 'medium',
          decompositionStrategy: 'region-crop',
          assetRoute: 'direct-generate',
          assetOpportunities: ['product glow mark'],
        },
      ],
      overlays: [],
      states: [],
      interactions: [
        {
          id: 'open-pricing',
          label: 'View pricing',
          trigger: 'click',
          sourceSectionId: 'hero',
          sourceElement: 'primary CTA',
          intent: 'Compare available plans.',
          action: { type: 'navigate', targetPageId: 'pricing' },
        },
      ],
    },
    {
      id: 'pricing',
      name: 'Pricing',
      route: '/pricing',
      purpose: 'Compare plans and start checkout.',
      viewport: {
        platform: 'desktop web',
        width: 1440,
        height: 900,
        scroll: 'single-screen',
      },
      regions: [
        {
          id: 'plans',
          name: 'Plan comparison',
          role: 'conversion',
          summary: 'Three plan tiers with a highlighted recommended plan.',
          complexity: 'low',
          decompositionStrategy: 'direct',
          assetRoute: 'ignore-code-ui',
          assetOpportunities: [],
        },
      ],
      overlays: [
        {
          id: 'contact-sales',
          name: 'Contact sales',
          purpose: 'Collect enterprise lead details.',
        },
      ],
      states: [],
      interactions: [
        {
          id: 'open-sales',
          label: 'Contact sales',
          trigger: 'click',
          sourceSectionId: 'plans',
          sourceElement: 'enterprise CTA',
          intent: 'Open sales inquiry form.',
          action: { type: 'open-overlay', targetOverlayId: 'contact-sales' },
        },
      ],
    },
  ],
  flows: [
    {
      id: 'visitor-to-pricing',
      name: 'Visitor compares pricing',
      goal: 'Move from product story to plan comparison.',
      startPageId: 'home',
      steps: [
        {
          fromPageId: 'home',
          interactionId: 'open-pricing',
          toPageId: 'pricing',
        },
      ],
    },
  ],
  humanLoop: {
    mode: 'continue',
    rationale: 'The SaaS visitor flow is clear enough to proceed.',
  },
  reviewDocument: currentPrototypeReviewDocument,
}

describe('PrototypePlan', () => {
  it('parses and validates a reachable multi-page plan', () => {
    const parsed = prototypePlanSchema.parse(validPlan)
    const result = validatePrototypePlan(parsed)

    expect(result.ok).toBe(true)
    expect(result.ok && result.data.reachablePageIds).toEqual(['home', 'pricing'])
  })

  it('applies the current continue default when a planner omits humanLoop', () => {
    const raw = structuredClone(validPlan)
    delete (raw as Partial<PrototypePlan>).humanLoop

    const parsed = prototypePlanSchema.parse(raw)

    expect(parsed.humanLoop).toEqual({
      mode: 'continue',
      rationale: 'The requirement is clear enough to proceed.',
    })
  })

  it('requires current exploration and review artifacts', () => {
    const missingReview = structuredClone(validPlan) as Partial<PrototypePlan>
    delete missingReview.reviewDocument
    expect(prototypePlanSchema.safeParse(missingReview).success).toBe(false)
    const missingExploration = structuredClone(validPlan)
    delete (missingExploration.designSystem as Partial<PrototypePlan['designSystem']>).exploration
    expect(prototypePlanSchema.safeParse(missingExploration).success).toBe(false)
    expect(generatedPrototypePlanSchema.parse(validPlan).reviewDocument.fullPlan).toContain('Current fixture')
  })

  it('applies the current board-cutout route default when a region omits assetRoute', () => {
    const raw = structuredClone(validPlan)
    delete (raw.pages[0].regions[0] as Partial<PrototypePlan['pages'][number]['regions'][number]>).assetRoute

    const parsed = prototypePlanSchema.parse(raw)

    expect(parsed.pages[0].regions[0].assetRoute).toBe('board-cutout')
  })

  it('requires each Agent-authored route to declare zero or more classified materials', () => {
    const seed = {
      product: {
        name: 'Field Notes',
        summary: 'A route journal for urban walks.',
        audience: 'Independent walkers',
        primaryGoal: 'Turn observations into reusable route stories.',
        platform: 'responsive web app',
      },
      rationale: 'The route graph and materials follow the actual journal workflow.',
      suites: [{
        direction: {
          id: 'editorial',
          label: 'Editorial field guide',
          thesis: 'Prioritize place identity and collected observations.',
          vary: ['material density'],
          preserve: ['route accuracy'],
        },
        pages: [
          {
            id: 'route-index',
            name: 'Route index',
            route: '/routes',
            purpose: 'Browse saved walking routes.',
            viewport: {
              platform: 'desktop', width: 1440, height: 1000, scroll: 'long-scroll',
            },
            materials: [],
          },
          {
            id: 'route-story',
            name: 'Route story',
            route: '/routes/story',
            purpose: 'Read the observations and visual identity of one route.',
            viewport: {
              platform: 'desktop', width: 1440, height: 1000, scroll: 'long-scroll',
            },
            materials: [
              {
                id: 'marker-set',
                name: 'Route marker set',
                description: 'Three reusable illustrated location markers.',
                production: 'board-cutout',
                boardGroupId: 'route-markers',
              },
              {
                id: 'route-map',
                name: 'Illustrated route map',
                description: 'One art-directed map showing the complete walk.',
                production: 'direct-generate',
              },
            ],
          },
        ],
      }],
    }

    const parsed = prototypePlanningSeedSchema.parse(seed)
    expect(parsed.suites[0]!.pages[0]!.materials).toEqual([])
    expect(parsed.suites[0]!.pages[1]!.materials.map((material) => material.production)).toEqual([
      'board-cutout',
      'direct-generate',
    ])
    const boardMaterial = parsed.suites[0]!.pages[1]!.materials[0]!
    expect(boardMaterial.production).toBe('board-cutout')
    if (boardMaterial.production !== 'board-cutout') throw new Error('Expected a board material.')
    expect(boardMaterial.boardGroupId).toBe('route-markers')

    const missing = structuredClone(seed)
    delete (missing.suites[0]!.pages[0] as { materials?: unknown }).materials
    expect(prototypePlanningSeedSchema.safeParse(missing).success).toBe(false)

    const invalidProduction = structuredClone(seed)
    invalidProduction.suites[0]!.pages[1]!.materials[0]!.production = 'ignore-code-ui'
    expect(prototypePlanningSeedSchema.safeParse(invalidProduction).success).toBe(false)

    const invalidDirectGroup = structuredClone(seed)
    invalidDirectGroup.suites[0]!.pages[1]!.materials[1]!.boardGroupId = 'not-a-board'
    expect(prototypePlanningSeedSchema.safeParse(invalidDirectGroup).success).toBe(false)

    const missingGroup = structuredClone(seed)
    delete (missingGroup.suites[0]!.pages[1]!.materials[0] as {
      boardGroupId?: string
    }).boardGroupId
    const missingGroupResult = prototypePlanningSeedSchema.safeParse(missingGroup)
    expect(missingGroupResult.success).toBe(false)
    if (missingGroupResult.success) throw new Error('Expected board materials to require a group id.')
    expect(missingGroupResult.error.issues[0]).toMatchObject({
      path: ['suites', 0, 'pages', 1, 'materials', 0, 'boardGroupId'],
      message: 'Invalid input: expected string, received undefined',
    })

    const providerSchema = JSON.stringify(
      z.toJSONSchema(generatedPrototypePlanningMaterialSchema),
    )
    expect(providerSchema).toContain(
      '"required":["id","name","description","production","boardGroupId"]',
    )
  })

  it('does not impose a per-route material quota on an Agent-authored graph', () => {
    const materials = Array.from({ length: 30 }, (_, index) => ({
      id: `scene-${index + 1}`,
      name: `Scene ${index + 1}`,
      description: `Standalone reusable scene ${index + 1}.`,
      production: 'direct-generate' as const,
    }))
    const result = generatedPrototypePlanningSeedSchema.safeParse({
      product: {
        name: 'World Atlas',
        summary: 'A reference atlas whose authored scene graph is unusually broad.',
        audience: 'World builders',
        primaryGoal: 'Organize reusable scenes for one atlas route.',
        platform: 'desktop app',
      },
      rationale: 'The domain requires every independently reusable authored scene.',
      suites: [{
        direction: {
          id: 'atlas',
          label: 'Atlas',
          thesis: 'Treat every scene as independent production material.',
          vary: ['scene treatment'],
          preserve: ['world identity'],
        },
        pages: [{
          id: 'world-atlas',
          name: 'World atlas',
          route: '/atlas',
          purpose: 'Browse the complete authored scene collection.',
          viewport: {
            platform: 'desktop', width: 1440, height: 1000, scroll: 'long-scroll',
          },
          materials,
        }],
      }],
    })

    expect(result.success).toBe(true)
    expect(result.success && result.data.suites[0]!.pages[0]!.materials).toHaveLength(30)
  })

  it('rejects duplicate material ids within one route', () => {
    const result = prototypePlanningSeedSchema.safeParse({
      product: {
        name: 'Field Notes',
        summary: 'A route journal for urban walks.',
        audience: 'Independent walkers',
        primaryGoal: 'Turn observations into reusable route stories.',
        platform: 'responsive web app',
      },
      rationale: 'One route with separately produced visual materials.',
      suites: [{
        direction: {
          id: 'editorial',
          label: 'Editorial field guide',
          thesis: 'Prioritize place identity.',
          vary: ['material treatment'],
          preserve: ['route accuracy'],
        },
        pages: [{
          id: 'route-story',
          name: 'Route story',
          route: '/routes/story',
          purpose: 'Read one route.',
          viewport: {
            platform: 'desktop', width: 1440, height: 1000, scroll: 'long-scroll',
          },
          materials: [
            {
              id: 'map',
              name: 'Route map',
              description: 'A reusable route map.',
              production: 'direct-generate',
            },
            {
              id: 'map',
              name: 'Marker board',
              description: 'A board of route markers.',
              production: 'board-cutout',
              boardGroupId: 'route-markers',
            },
          ],
        }],
      }],
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected duplicate materials to fail validation.')
    expect(result.error.issues[0]?.message).toContain('Duplicate material id "map"')
  })

  it('validates a dynamic human-in-the-loop question', () => {
    const plan: PrototypePlan = {
      ...structuredClone(validPlan),
      humanLoop: {
        mode: 'ask',
        rationale: 'The platform choice changes the page graph.',
        question: 'Which surface should the prototype target first?',
        choices: [
          {
            id: 'web',
            label: 'Web SaaS',
            description: 'Plan a responsive web experience.',
            impact: 'Uses marketing and dashboard pages.',
          },
          {
            id: 'mobile',
            label: 'Mobile app',
            description: 'Plan a compact app flow.',
            impact: 'Uses tab navigation and mobile screens.',
          },
        ],
        defaultChoiceId: 'web',
      },
    }

    expect(validatePrototypePlan(plan).ok).toBe(true)
  })

  it('rejects a human-in-the-loop default choice that is not available', () => {
    const plan: PrototypePlan = {
      ...structuredClone(validPlan),
      humanLoop: {
        mode: 'ask',
        rationale: 'The platform choice changes the page graph.',
        question: 'Which surface should the prototype target first?',
        choices: [
          {
            id: 'web',
            label: 'Web SaaS',
            description: 'Plan a responsive web experience.',
            impact: 'Uses marketing and dashboard pages.',
          },
          {
            id: 'mobile',
            label: 'Mobile app',
            description: 'Plan a compact app flow.',
            impact: 'Uses tab navigation and mobile screens.',
          },
        ],
        defaultChoiceId: 'desktop',
      },
    }

    const result = validatePrototypePlan(plan)

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('default choice "desktop"')
  })

  it('rejects interactions that navigate to missing pages', () => {
    const plan = structuredClone(validPlan)
    plan.pages[0].interactions[0].action = {
      type: 'navigate',
      targetPageId: 'missing',
    }

    const result = validatePrototypePlan(plan)

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('unknown page "missing"')
  })

  it('rejects duplicate route identities without prescribing a route structure', () => {
    const plan = structuredClone(validPlan)
    plan.pages[1].route = plan.pages[0].route

    const result = validatePrototypePlan(plan)

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('Duplicate page route: "/"')
  })

  it('rejects plans with unreachable pages', () => {
    const plan = structuredClone(validPlan)
    plan.pages.push({
      id: 'about',
      name: 'About',
      route: '/about',
      purpose: 'Explain company credibility.',
      viewport: {
        platform: 'desktop web',
        width: 1440,
        height: 900,
        scroll: 'single-screen',
      },
      regions: [
        {
          id: 'story',
          name: 'Story',
          role: 'trust',
          summary: 'Company origin and team proof.',
          complexity: 'low',
          decompositionStrategy: 'direct',
          assetRoute: 'direct-generate',
          assetOpportunities: [],
        },
      ],
      overlays: [],
      states: [],
      interactions: [],
    })

    const result = validatePrototypePlan(plan)

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('unreachable pages: about')
  })

  it('rejects flow steps whose target disagrees with the interaction', () => {
    const plan = structuredClone(validPlan)
    plan.flows[0].steps[0].toPageId = 'home'

    const result = validatePrototypePlan(plan)

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('target does not match')
  })
})
