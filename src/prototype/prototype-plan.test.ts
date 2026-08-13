import { describe, expect, it } from 'vitest'
import {
  generatedPrototypePlanSchema,
  prototypePlanSchema,
  prototypeRouteGraphFingerprint,
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
  it('fingerprints semantic graph changes even when route strings are unchanged', () => {
    const alternative = structuredClone(validPlan)
    alternative.pages[0]!.regions[0]!.summary = 'A different information hierarchy.'

    expect(alternative.pages.map(({ route }) => route)).toEqual(
      validPlan.pages.map(({ route }) => route),
    )
    expect(prototypeRouteGraphFingerprint(alternative)).not.toBe(
      prototypeRouteGraphFingerprint(validPlan),
    )
  })

  it('keeps id-renamed and reordered copies on one canonical graph identity', () => {
    const renamed = structuredClone(validPlan)
    const [home, pricing] = renamed.pages
    home.id = 'page-a'
    home.regions[0]!.id = 'region-a'
    home.interactions[0]!.id = 'interaction-a'
    home.interactions[0]!.sourceSectionId = 'region-a'
    home.interactions[0]!.action = { type: 'navigate', targetPageId: 'page-b' }
    pricing.id = 'page-b'
    pricing.regions[0]!.id = 'region-b'
    pricing.overlays[0]!.id = 'overlay-b'
    pricing.interactions[0]!.id = 'interaction-b'
    pricing.interactions[0]!.sourceSectionId = 'region-b'
    pricing.interactions[0]!.action = { type: 'open-overlay', targetOverlayId: 'overlay-b' }
    renamed.flows[0]!.id = 'flow-renamed'
    renamed.flows[0]!.startPageId = 'page-a'
    renamed.flows[0]!.steps[0] = {
      fromPageId: 'page-a',
      interactionId: 'interaction-a',
      toPageId: 'page-b',
    }
    renamed.pages.reverse()

    expect(prototypeRouteGraphFingerprint(renamed)).toBe(
      prototypeRouteGraphFingerprint(validPlan),
    )
  })

  it('parses and validates a reachable multi-page plan', () => {
    const parsed = prototypePlanSchema.parse(validPlan)
    const result = validatePrototypePlan(parsed)

    expect(result.ok).toBe(true)
    expect(result.ok && result.data.reachablePageIds).toEqual(['home', 'pricing'])
  })

  it('rejects a navigation flow step that omits its exact target page', () => {
    const plan = structuredClone(validPlan)
    delete plan.flows[0]!.steps[0]!.toPageId

    expect(validatePrototypePlan(plan)).toEqual({
      ok: false,
      error: 'Flow "visitor-to-pricing" step "open-pricing" target does not match the interaction target.',
    })
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
