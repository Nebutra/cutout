import { describe, expect, it } from 'vitest'
import {
  generatedPrototypePlanSchema,
  prototypePlanSchema,
  validatePrototypePlan,
  type PrototypePlan,
} from './prototype-plan'

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
}

describe('PrototypePlan', () => {
  it('parses and validates a reachable multi-page plan', () => {
    const parsed = prototypePlanSchema.parse(validPlan)
    const result = validatePrototypePlan(parsed)

    expect(result.ok).toBe(true)
    expect(result.ok && result.data.reachablePageIds).toEqual(['home', 'pricing'])
  })

  it('defaults to continue when old planner output omits humanLoop', () => {
    const raw = structuredClone(validPlan)
    delete (raw as Partial<PrototypePlan>).humanLoop

    const parsed = prototypePlanSchema.parse(raw)

    expect(parsed.humanLoop).toEqual({
      mode: 'continue',
      rationale: 'The requirement is clear enough to proceed.',
    })
  })

  it('accepts legacy plans without a review artifact and validates authored scope documents', () => {
    const legacy = prototypePlanSchema.parse(structuredClone(validPlan))
    expect(legacy.reviewDocument).toBeUndefined()

    const authored = prototypePlanSchema.parse({
      ...structuredClone(validPlan),
      designSystem: {
        ...structuredClone(validPlan.designSystem),
        exploration: {
          mode: 'auto',
          decidedBy: 'agent',
          count: 1,
          rationale: 'The requirement already establishes one clear visual direction.',
          directions: [{
            id: 'direction:primary',
            label: 'Primary direction',
            thesis: 'Preserve the requested product identity.',
            vary: ['visual treatment'],
            preserve: ['product intent'],
          }],
          bounds: { maxCandidates: 8, maxParallelism: 2 },
        },
      },
      reviewDocument: {
        format: 'markdown',
        primaryFlow: '# Primary flow\n\nA focused review.',
        fullPlan: '# Full plan\n\n| Page | Purpose |\n| --- | --- |\n| Home | Convert |',
      },
    })
    expect(authored.reviewDocument?.primaryFlow).toContain('focused review')
    expect(() => generatedPrototypePlanSchema.parse(legacy)).toThrow()
    expect(generatedPrototypePlanSchema.parse(authored).reviewDocument.fullPlan).toContain('Full plan')
  })

  it('defaults old region output to board-cutout when assetRoute is omitted', () => {
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
