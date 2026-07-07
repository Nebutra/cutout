import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { err, ok, type Result } from '@/services/types'
import type { GenerateInput, GenerationService } from '@/services/ai/types'
import type { IntentProfile } from '@/dag/intent-types'
import {
  composePrototypeRequirement,
  createLocalPrototypePlan,
  planPrototype,
  shouldUseLocalSemanticFallback,
} from './planner'
import {
  prototypePlanSchema,
  validatePrototypePlan,
  type PrototypePlan,
} from './prototype-plan'

type GenObjectFn = <T>(
  input: GenerateInput,
  schema: z.ZodType<T>,
) => Promise<Result<T>>

function fakeGeneration(generateObject: unknown) {
  return {
    generateObject: generateObject as GenObjectFn,
  } as Pick<GenerationService, 'generateObject'>
}

function mockGenerateObject<TData>(result: Result<TData>) {
  return vi.fn(<T,>(
    _input: GenerateInput,
    _schema: z.ZodType<T>,
  ): Promise<Result<T>> => Promise.resolve(result as unknown as Result<T>))
}

const samplePlan: PrototypePlan = {
  version: 'prototype-plan.v0',
  product: {
    name: 'Dance Club',
    summary: 'Premium nightlife booking and VIP table discovery.',
    audience: 'Club visitors and promoters',
    primaryGoal: 'Book a VIP table.',
    platform: 'mobile app',
  },
  designSystem: {
    styleSummary: 'Dark neon, glossy nightlife visuals.',
    palette: ['black', 'magenta', 'gold'],
    typography: 'Condensed display headings with compact labels.',
    spacing: 'Tight mobile rhythm with 8px increments.',
    componentPrinciples: ['clear CTA hierarchy', 'consistent nightlife cards'],
    assetDirection: 'Generate venue covers, VIP badges, and avatar artwork.',
  },
  pages: [
    {
      id: 'home',
      name: 'Home',
      route: '/',
      purpose: 'Surface featured venues and start booking.',
      viewport: {
        platform: 'iOS',
        width: 390,
        height: 844,
        scroll: 'long-scroll',
      },
      regions: [
        {
          id: 'hero',
          name: 'Featured club',
          role: 'discovery',
          summary: 'Featured venue cover and booking CTA.',
          complexity: 'high',
          decompositionStrategy: 'recursive-region',
          assetRoute: 'direct-generate',
          assetOpportunities: ['club cover art', 'VIP badge'],
        },
      ],
      overlays: [],
      states: [],
      interactions: [
        {
          id: 'open-booking',
          label: 'Book now',
          trigger: 'tap',
          sourceSectionId: 'hero',
          sourceElement: 'booking CTA',
          intent: 'Open the booking detail screen.',
          action: { type: 'navigate', targetPageId: 'booking' },
        },
      ],
    },
    {
      id: 'booking',
      name: 'Booking',
      route: '/booking',
      purpose: 'Choose time, guests, and VIP package.',
      viewport: {
        platform: 'iOS',
        width: 390,
        height: 844,
        scroll: 'single-screen',
      },
      regions: [
        {
          id: 'form',
          name: 'Booking form',
          role: 'conversion',
          summary: 'Date, guests, and package controls.',
          complexity: 'medium',
          decompositionStrategy: 'direct',
          assetRoute: 'ignore-code-ui',
          assetOpportunities: ['package badge art'],
        },
      ],
      overlays: [],
      states: [],
      interactions: [],
    },
  ],
  flows: [
    {
      id: 'book-vip',
      name: 'Book a VIP table',
      goal: 'Move from discovery to booking.',
      startPageId: 'home',
      steps: [
        {
          fromPageId: 'home',
          interactionId: 'open-booking',
          toPageId: 'booking',
        },
      ],
    },
  ],
  humanLoop: {
    mode: 'continue',
    rationale: 'The booking flow is specific enough to proceed.',
  },
}

describe('planPrototype', () => {
  it('rejects an empty brief without calling the model', async () => {
    const generateObject = mockGenerateObject(ok(samplePlan))
    const result = await planPrototype(fakeGeneration(generateObject), {
      providerId: 'p',
      model: 'm',
      brief: ' ',
    })

    expect(result.ok).toBe(false)
    expect(generateObject).not.toHaveBeenCalled()
  })

  it('plans a valid prototype suite on the chat slot', async () => {
    const generateObject = mockGenerateObject(ok(samplePlan))
    const result = await planPrototype(fakeGeneration(generateObject), {
      providerId: 'chat',
      model: 'gpt-5.5',
      brief: '脱衣舞娘俱乐部',
    })

    expect(result).toEqual(ok(samplePlan))
    const [input, schema] = generateObject.mock.calls[0]
    expect(input.promptRef).toEqual({ id: 'ui-prototype-planner' })
    expect(input.model).toBe('gpt-5.5')
    expect(input.input?.[0]).toEqual({
      type: 'text',
      text: '脱衣舞娘俱乐部',
    })
    expect(schema).toBe(prototypePlanSchema)
  })

  it('composes reconstructed intent into the planner input', async () => {
    const intent: IntentProfile = {
      goal: 'A premium nightlife booking app',
      strategy: 'VIP booking flow with rich venue discovery',
      rationale: 'The request implies visual atmosphere plus conversion.',
      dimensions: [{ aspect: 'platform', value: 'mobile app' }],
      assumptions: ['Consumer-facing booking flow'],
      confidence: 0.87,
      questions: [],
    }
    const generateObject = mockGenerateObject(ok(samplePlan))
    const result = await planPrototype(fakeGeneration(generateObject), {
      providerId: 'chat',
      model: 'gpt-5.5',
      brief: '夜店',
      intent,
    })

    expect(result.ok).toBe(true)
    const [input] = generateObject.mock.calls[0]
    if (!input.input) throw new Error('Expected planner input parts.')
    const text = (input.input[0] as { type: 'text'; text: string }).text
    expect(text).toContain('VIP booking flow')
    expect(text).toContain('mobile app')
    expect(text).toContain('夜店')
  })

  it('composePrototypeRequirement returns the raw brief without intent', () => {
    expect(composePrototypeRequirement('pricing page')).toBe('pricing page')
  })

  it('propagates generation failures', async () => {
    const generateObject = mockGenerateObject(err('boom'))
    const result = await planPrototype(fakeGeneration(generateObject), {
      providerId: 'p',
      model: 'm',
      brief: 'x',
    })

    expect(result).toEqual(err('boom'))
  })

  it('uses a local semantic fallback when structured JSON fails before a timed-out repair', async () => {
    const plannerError =
      'Structured JSON generation failed (No object generated: response did not match schema.); fallback text JSON also failed: Failed after 2 attempts with non-retryable error: request failed: error sending request for url (https://example.test/v1/chat/completions): operation timed out'
    const generateObject = mockGenerateObject(err(plannerError))
    const result = await planPrototype(fakeGeneration(generateObject), {
      providerId: 'p',
      model: 'm',
      brief: '钻石王老五',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.data.version).toBe('prototype-plan.v0')
    expect(result.data.product.name).toBe('钻石王老五')
    expect(result.data.pages).toHaveLength(1)
    expect(result.data.humanLoop.mode).toBe('continue')
    expect(validatePrototypePlan(result.data).ok).toBe(true)
  })

  it('uses the local fallback for transient provider timeouts', async () => {
    const generateObject = mockGenerateObject(
      err('request failed: operation timed out'),
    )
    const result = await planPrototype(fakeGeneration(generateObject), {
      providerId: 'p',
      model: 'm',
      brief: '钻石王老五',
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.product.name).toBe('钻石王老五')
  })

  it('does not use the local fallback for provider auth failures', async () => {
    const generateObject = mockGenerateObject(err('API_KEY_REQUIRED'))
    const result = await planPrototype(fakeGeneration(generateObject), {
      providerId: 'p',
      model: 'm',
      brief: '钻石王老五',
    })

    expect(result).toEqual(err('API_KEY_REQUIRED'))
  })

  it('detects structured planner failures separately from provider failures', () => {
    expect(
      shouldUseLocalSemanticFallback(
        'Structured JSON generation failed (No object generated: response did not match schema.)',
      ),
    ).toBe(true)
    expect(shouldUseLocalSemanticFallback('API_KEY_REQUIRED')).toBe(false)
  })

  it('creates a valid local prototype plan from the brief', () => {
    const plan = createLocalPrototypePlan('cat store')

    expect(plan.product.name).toBe('cat store')
    expect(plan.designSystem.palette).toContain('soft peach')
    expect(validatePrototypePlan(plan).ok).toBe(true)
  })

  it('rejects a plan with unreachable pages', async () => {
    const invalid: PrototypePlan = {
      ...samplePlan,
      pages: [
        ...samplePlan.pages,
        {
          ...samplePlan.pages[1],
          id: 'about',
          name: 'About',
          route: '/about',
        },
      ],
    }
    const generateObject = mockGenerateObject(ok(invalid))
    const result = await planPrototype(fakeGeneration(generateObject), {
      providerId: 'p',
      model: 'm',
      brief: 'x',
    })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('invalid prototype plan')
    expect(!result.ok && result.error).toContain('unreachable pages')
  })
})
