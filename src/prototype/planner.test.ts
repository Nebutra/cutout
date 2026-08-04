import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { err, ok, type Result } from '@/services/types'
import type { GenerateInput, GenerationService } from '@/services/ai/types'
import type { IntentProfile } from '@/dag/intent-types'
import {
  composePrototypeRequirement,
  createLocalPrototypePlan,
  createPrototypePlanFromSeed,
  explicitPrototypePageCount,
  planPrototype,
} from './planner'
import {
  generatedPrototypePlanSchema,
  validatePrototypePlan,
  type PrototypePlan,
  type PrototypePlanningSeed,
} from './prototype-plan'
import { prototypePageAssetCount } from './asset-manifest'
import { currentPrototypeExploration } from './prototype-plan.test-fixture'

type GenObjectFn = <T>(
  input: GenerateInput,
  schema: z.ZodType<T>,
) => Promise<Result<T>>

type GenTextFn = (input: GenerateInput) => Promise<Result<string>>

function fakeGeneration(
  generateObject: unknown,
  generateText: unknown = vi.fn(() => Promise.resolve(err('Unexpected text planner call.'))),
) {
  const text = generateText as GenTextFn
  return {
    generateObject: generateObject as GenObjectFn,
    async *streamText(input: GenerateInput) {
      const result = await text(input)
      if (!result.ok) throw new Error(result.error)
      yield result.data
    },
  } as Pick<GenerationService, 'generateObject' | 'streamText'>
}

function mockGenerateObject<TData>(result: Result<TData>) {
  return vi.fn(<T,>(
    _input: GenerateInput,
    _schema: z.ZodType<T>,
  ): Promise<Result<T>> => Promise.resolve(result as unknown as Result<T>))
}

function mockGenerateSequence(...results: Result<unknown>[]) {
  return vi.fn(<T,>(
    _input: GenerateInput,
    _schema: z.ZodType<T>,
  ): Promise<Result<T>> => {
    const result = results.shift()
    if (!result) throw new Error('Unexpected planner call.')
    return Promise.resolve(result as unknown as Result<T>)
  })
}

function mockGenerateText(result: Result<string>) {
  return vi.fn((_input: GenerateInput): Promise<Result<string>> =>
    Promise.resolve(result))
}

const samplePlan: PrototypePlan = {
  version: 'prototype-plan.v0',
  product: {
    name: 'Dance Club',
    projectName: 'VIP Club',
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
    exploration: currentPrototypeExploration,
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
  reviewDocument: {
    format: 'markdown',
    primaryFlow: '# Book a VIP table\n\nReview the core booking flow.',
    fullPlan: '# VIP booking prototype\n\nReview all planned surfaces.',
  },
  humanLoop: {
    mode: 'continue',
    rationale: 'The booking flow is specific enough to proceed.',
  },
}

const PROGRESSIVE_TEST_BRIEF =
  'Create a complete six page benchmark route graph; derive useful material scope independently for each page.'
const BENCHMARK_MATERIAL_COUNTS = [0, 1, 2, 3, 5, 7] as const

function createBenchmarkPlan(): PrototypePlan {
  const pages = Array.from(
    { length: 6 },
    (_, index): PrototypePlan['pages'][number] => {
      const pageNumber = index + 1
      const nextPageId = pageNumber < 6 ? `page-${pageNumber + 1}` : null
      const materialCount = BENCHMARK_MATERIAL_COUNTS[index]!
      return {
        ...samplePlan.pages[0]!,
        id: `page-${pageNumber}`,
        name: `Benchmark page ${pageNumber}`,
        route: pageNumber === 1 ? '/' : `/page-${pageNumber}`,
        purpose: `Serve benchmark journey step ${pageNumber}.`,
        viewport: {
          platform: 'desktop web',
          width: 1440,
          height: 1024,
          scroll: pageNumber % 2 === 0 ? 'single-screen' : 'long-scroll',
        },
        regions: [{
          ...samplePlan.pages[0]!.regions[0]!,
          id: `region-${pageNumber}`,
          assetRoute: materialCount === 0 ? 'ignore-code-ui' : 'board-cutout',
          assetOpportunities: Array.from(
            { length: materialCount },
            (_, assetIndex) => `page-${pageNumber}-asset-${assetIndex + 1}`,
          ),
        }],
        interactions: nextPageId === null ? [] : [{
          ...samplePlan.pages[0]!.interactions[0]!,
          id: `go-to-page-${pageNumber + 1}`,
          sourceSectionId: `region-${pageNumber}`,
          action: { type: 'navigate', targetPageId: nextPageId },
        }],
      }
    },
  )

  return {
    ...samplePlan,
    designSystem: {
      ...samplePlan.designSystem,
      exploration: {
        mode: 'auto',
        decidedBy: 'agent',
        count: 1,
        rationale: 'One benchmark direction is sufficient for planner testing.',
        directions: [{
          id: 'benchmark-direction',
          label: 'Benchmark direction',
          thesis: 'Keep the six-page benchmark visually coherent.',
          vary: ['visual execution'],
          preserve: ['route intent', 'asset coverage'],
        }],
        bounds: { maxCandidates: 8, maxParallelism: 2 },
      },
    },
    pages,
    flows: [{
      id: 'benchmark-journey',
      name: 'Benchmark journey',
      goal: 'Visit every planned benchmark page.',
      startPageId: 'page-1',
      steps: pages.slice(0, -1).map((page, index) => ({
        fromPageId: page.id,
        interactionId: `go-to-page-${index + 2}`,
        toPageId: `page-${index + 2}`,
      })),
    }],
  }
}

function progressiveOutlineFor(plan: PrototypePlan) {
  return {
    version: plan.version,
    product: plan.product,
    pages: plan.pages.map(({ id, name, route, purpose, viewport }) => ({
      id,
      name,
      route,
      purpose,
      viewport,
    })),
    humanLoop: plan.humanLoop,
  }
}

function progressiveOutlineProtocolFor(plan: PrototypePlan): string {
  const lines = [
    'CUTOUT_OUTLINE_V1',
    'VERSION\tprototype-plan.v0',
    [
      'PRODUCT',
      plan.product.name,
      plan.product.projectName ?? '-',
      plan.product.summary,
      plan.product.audience,
      plan.product.primaryGoal,
      plan.product.platform,
    ].join('\t'),
    ...plan.pages.map((page) => [
      'PAGE',
      page.id,
      page.name,
      page.route,
      page.purpose,
      page.viewport.platform,
      String(page.viewport.width),
      String(page.viewport.height),
      page.viewport.scroll,
    ].join('\t')),
  ]
  if (plan.humanLoop.mode === 'continue') {
    lines.push(['CONTINUE', plan.humanLoop.rationale].join('\t'))
  } else {
    lines.push([
      'ASK',
      plan.humanLoop.rationale,
      plan.humanLoop.question,
      plan.humanLoop.defaultChoiceId,
    ].join('\t'))
    lines.push(...plan.humanLoop.choices.map((choice) => [
      'CHOICE',
      choice.id,
      choice.label,
      choice.description,
      choice.impact,
    ].join('\t')))
  }
  lines.push('END')
  return lines.join('\n')
}

function progressiveDesignFoundationFor(plan: PrototypePlan) {
  return {
    styleSummary: plan.designSystem.styleSummary,
    palette: plan.designSystem.palette,
    typography: plan.designSystem.typography,
    spacing: plan.designSystem.spacing,
    componentPrinciples: plan.designSystem.componentPrinciples,
    assetDirection: plan.designSystem.assetDirection,
  }
}

function progressiveDesignExplorationFor(plan: PrototypePlan) {
  const exploration = plan.designSystem.exploration
  if (!exploration) throw new Error('Expected benchmark Design System exploration.')
  return {
    mode: exploration.mode,
    decidedBy: exploration.decidedBy === 'fallback' ? 'agent' as const : exploration.decidedBy,
    count: exploration.count,
    rationale: exploration.rationale,
    directions: exploration.directions,
  }
}

function progressiveClosureFor(plan: PrototypePlan) {
  if (!plan.reviewDocument) throw new Error('Expected a benchmark review document.')
  return {
    flows: plan.flows,
    reviewDocument: plan.reviewDocument,
  }
}

describe('planPrototype', () => {
  it('extracts mentioned page counts as progressive-planning workload evidence', () => {
    expect(explicitPrototypePageCount('只需要两个页面')).toBe(2)
    expect(explicitPrototypePageCount('Build 3 screens')).toBe(3)
    expect(explicitPrototypePageCount('Create two pages')).toBe(2)
    expect(explicitPrototypePageCount(
      '原型必须恰好包含 6 个完整、可互相导航的页面，由你决定路由。',
    )).toBe(6)
    expect(explicitPrototypePageCount('做一个清晰的工作台')).toBeNull()
  })

  it('does not repair Agent-authored material scope to a user-mentioned quota', async () => {
    const generateObject = mockGenerateObject(ok(samplePlan))
    const result = await planPrototype(fakeGeneration(generateObject), {
      providerId: 'p',
      model: 'm',
      brief: '做两个页面，每个页面产生 8 个素材，但只保留真正可复用且不能由代码重建的内容。',
    })

    expect(result).toEqual(ok(samplePlan))
    expect(result.ok && result.data.pages.map(prototypePageAssetCount)).toEqual([2, 0])
    expect(generateObject).toHaveBeenCalledTimes(1)
  })

  it('accepts a valid Agent-authored graph whose count differs from the user mention', async () => {
    const generateObject = mockGenerateObject(ok(samplePlan))
    const result = await planPrototype(fakeGeneration(generateObject), {
      providerId: 'p',
      model: 'm',
      brief: 'Build a three-page restaurant site, but cover the complete ordering journey.',
    })

    expect(result).toEqual(ok(samplePlan))
    expect(result.ok && result.data.pages).toHaveLength(2)
    expect(generateObject).toHaveBeenCalledTimes(1)
  })

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
    expect(result.ok && result.data.reviewDocument?.fullPlan).toContain('all planned surfaces')
    const [input, schema] = generateObject.mock.calls[0]
    expect(input.promptRef).toEqual({ id: 'ui-prototype-planner' })
    expect(input.model).toBe('gpt-5.5')
    expect(input.input?.[0]).toEqual({
      type: 'text',
      text: '脱衣舞娘俱乐部',
    })
    expect(schema).toBe(generatedPrototypePlanSchema)
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

  it('fails truthfully when neither structured planner can author a topology', async () => {
    const plannerError =
      'Structured JSON generation failed (No object generated: response did not match schema.); fallback text JSON also failed: Failed after 2 attempts with non-retryable error: request failed: error sending request for url (https://example.test/v1/chat/completions): operation timed out'
    const generateObject = mockGenerateSequence(
      err(plannerError),
      err('Structured JSON generation failed: response did not match schema'),
    )
    const result = await planPrototype(fakeGeneration(
      generateObject,
      mockGenerateText(ok('not-the-closed-protocol')),
    ), {
      providerId: 'p',
      model: 'm',
      brief: '钻石王老五',
    })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('did not match the closed line protocol')
    expect(generateObject).toHaveBeenCalledTimes(2)
  })

  it('propagates transient provider failures without inventing a one-page plan', async () => {
    const generateObject = mockGenerateObject(
      err('request failed: operation timed out'),
    )
    const result = await planPrototype(fakeGeneration(generateObject), {
      providerId: 'p',
      model: 'm',
      brief: '钻石王老五',
    })

    expect(result).toEqual(err('request failed: operation timed out'))
  })

  it('propagates provider auth failures without inventing topology', async () => {
    const generateObject = mockGenerateObject(err('API_KEY_REQUIRED'))
    const result = await planPrototype(fakeGeneration(generateObject), {
      providerId: 'p',
      model: 'm',
      brief: '钻石王老五',
    })

    expect(result).toEqual(err('API_KEY_REQUIRED'))
  })

  it('preserves heterogeneous Agent-authored material scope progressively', async () => {
    const plan = createBenchmarkPlan()
    const generateObject = mockGenerateSequence(
      ok(progressiveDesignFoundationFor(plan)),
      ok(progressiveDesignExplorationFor(plan)),
      ...plan.pages.map((page) => ok(page)),
      ok(progressiveClosureFor(plan)),
    )
    const generateText = mockGenerateText(ok(progressiveOutlineProtocolFor(plan)))
    const result = await planPrototype(fakeGeneration(generateObject, generateText), {
      providerId: 'p',
      model: 'm',
      brief: PROGRESSIVE_TEST_BRIEF,
    })

    expect(result).toEqual(ok(plan))
    expect(generateObject).toHaveBeenCalledTimes(9)
    expect(generateObject.mock.calls.map(([input]) => input.maxOutputTokens)).toEqual([
      8_000,
      8_000,
      12_000,
      12_000,
      12_000,
      12_000,
      12_000,
      12_000,
      20_000,
    ])
    expect(generateObject.mock.calls.every(([input]) => input.reasoningEffort === 'low')).toBe(true)
    expect(result.ok && result.data.pages).toHaveLength(6)
    expect(
      result.ok && result.data.pages.map(prototypePageAssetCount),
    ).toEqual(BENCHMARK_MATERIAL_COUNTS)
    const pageStageInput = generateObject.mock.calls[2]![0].input?.[0]
    expect(pageStageInput?.type === 'text' ? pageStageInput.text : '').toContain(
      'Choose zero or more reusable non-UI asset opportunities',
    )
    expect(pageStageInput?.type === 'text' ? pageStageInput.text : '').not.toMatch(
      /\b(?:exactly|at least)\s+\d+\s+(?:assets|materials)\b/i,
    )
    expect(generateObject.mock.calls[2]![0].system).toContain(
      'never one call per manifest item by default',
    )
  })

  it('parses a bounded Agent-authored six-route outline before schema generation', async () => {
    const plan = createBenchmarkPlan()
    const generateObject = mockGenerateSequence(
      ok(progressiveDesignFoundationFor(plan)),
      ok(progressiveDesignExplorationFor(plan)),
      ...plan.pages.map((page) => ok(page)),
      ok(progressiveClosureFor(plan)),
    )
    const generateText = mockGenerateText(ok(progressiveOutlineProtocolFor(plan)))

    const result = await planPrototype(fakeGeneration(generateObject, generateText), {
      providerId: 'p',
      model: 'm',
      brief: PROGRESSIVE_TEST_BRIEF,
    })

    expect(result).toEqual(ok(plan))
    expect(generateText).toHaveBeenCalledTimes(1)
    expect(generateText.mock.calls[0]![0].maxOutputTokens).toBe(4_000)
    expect(generateText.mock.calls[0]![0].system).toContain('CUTOUT_OUTLINE_V1')
    expect(generateObject.mock.calls[0]![0].system).toContain('Design System architect')
    expect(result.ok && result.data.pages.map((page) => page.route)).toEqual(
      plan.pages.map((page) => page.route),
    )
  })

  it('accepts a progressive Agent-authored outline with a different route count', async () => {
    const benchmark = createBenchmarkPlan()
    const pages = benchmark.pages.slice(0, 5).map((page, index) =>
      index === 4 ? { ...page, interactions: [] } : page)
    const plan: PrototypePlan = {
      ...benchmark,
      pages,
      flows: [{
        ...benchmark.flows[0]!,
        steps: benchmark.flows[0]!.steps.slice(0, 4),
      }],
    }
    const generateObject = mockGenerateSequence(
      ok(progressiveDesignFoundationFor(plan)),
      ok(progressiveDesignExplorationFor(plan)),
      ...plan.pages.map((page) => ok(page)),
      ok(progressiveClosureFor(plan)),
    )
    const result = await planPrototype(fakeGeneration(
      generateObject,
      mockGenerateText(ok(progressiveOutlineProtocolFor(plan))),
    ), {
      providerId: 'p',
      model: 'm',
      brief: `${PROGRESSIVE_TEST_BRIEF} Cover the complete journey.`,
    })

    expect(result).toEqual(ok(plan))
    expect(result.ok && result.data.pages).toHaveLength(5)
  })

  it('preserves ask semantics and Agent-authored routes from the text outline', async () => {
    const benchmark = createBenchmarkPlan()
    const askPlan: PrototypePlan = {
      ...benchmark,
      humanLoop: {
        mode: 'ask',
        rationale: 'The audience mode changes the route content.',
        question: 'Which audience mode should lead the experience?',
        choices: [
          {
            id: 'solo',
            label: 'Solo planning',
            description: 'Prioritize individual itinerary controls.',
            impact: 'Personal recommendations lead each route.',
          },
          {
            id: 'group',
            label: 'Group planning',
            description: 'Prioritize shared decisions and voting.',
            impact: 'Collaboration leads each route.',
          },
        ],
        defaultChoiceId: 'solo',
      },
    }
    const generateObject = mockGenerateObject(
      err('Structured JSON generation failed: response did not match schema'),
    )
    const generateText = mockGenerateText(ok(progressiveOutlineProtocolFor(askPlan)))

    const result = await planPrototype(fakeGeneration(generateObject, generateText), {
      providerId: 'p',
      model: 'm',
      brief: PROGRESSIVE_TEST_BRIEF,
    })

    expect(result.ok && result.data.humanLoop).toEqual(askPlan.humanLoop)
    expect(result.ok && result.data.pages.map((page) => page.route)).toEqual(
      askPlan.pages.map((page) => page.route),
    )
    expect(generateObject).not.toHaveBeenCalled()
  })

  it('uses schema generation only when the bounded line protocol is invalid', async () => {
    const plan = createBenchmarkPlan()
    const outline = {
      ...progressiveOutlineFor(plan),
      humanLoop: {
        mode: 'ask' as const,
        rationale: 'The audience changes route content.',
        question: 'Which audience should lead?',
        choices: [
          { id: 'solo', label: 'Solo', description: 'Plan alone.', impact: 'Personal routes.' },
          { id: 'group', label: 'Group', description: 'Plan together.', impact: 'Shared routes.' },
        ],
        defaultChoiceId: 'solo',
      },
    }
    const generateObject = mockGenerateObject(ok(outline))
    const generateText = mockGenerateText(ok('not-the-closed-protocol'))

    const result = await planPrototype(fakeGeneration(generateObject, generateText), {
      providerId: 'p',
      model: 'm',
      brief: PROGRESSIVE_TEST_BRIEF,
    })

    expect(result.ok && result.data.pages.map((page) => page.route)).toEqual(
      plan.pages.map((page) => page.route),
    )
    expect(result.ok && result.data.humanLoop.mode).toBe('ask')
    expect(generateText).toHaveBeenCalledTimes(1)
    expect(generateObject).toHaveBeenCalledTimes(1)
  })

  it.each([
    {
      name: 'malformed lines',
      output: (plan: PrototypePlan) => progressiveOutlineProtocolFor(plan)
        .replace('PAGE\tpage-2', 'SCREEN\tpage-2'),
      error: 'did not match the closed line protocol',
    },
    {
      name: 'duplicate routes',
      output: (plan: PrototypePlan) => progressiveOutlineProtocolFor({
        ...plan,
        pages: plan.pages.map((page, index) => index === 5
          ? { ...page, route: plan.pages[4]!.route }
          : page),
      }),
      error: 'contained duplicate page or choice identities',
    },
    {
      name: 'unsafe routes',
      output: (plan: PrototypePlan) => progressiveOutlineProtocolFor({
        ...plan,
        pages: plan.pages.map((page, index) => index === 1
          ? { ...page, route: '../../private' }
          : page),
      }),
      error: 'contained an unsafe field',
    },
    {
      name: 'oversized output',
      output: (plan: PrototypePlan) => `${progressiveOutlineProtocolFor(plan)}${'RAW_OUTPUT_SENTINEL'.repeat(1_024)}`,
      error: 'exceeded the line protocol limits',
    },
  ])('rejects $name without echoing model output', async ({ output, error }) => {
    const plan = createBenchmarkPlan()
    const rawOutput = output(plan)
    const generateObject = mockGenerateObject(
      err('Structured JSON generation failed: response did not match schema'),
    )
    const generateText = mockGenerateText(ok(rawOutput))

    const result = await planPrototype(fakeGeneration(generateObject, generateText), {
      providerId: 'p',
      model: 'm',
      brief: PROGRESSIVE_TEST_BRIEF,
    })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain(error)
    expect(!result.ok && result.error).not.toContain(rawOutput)
    expect(generateObject).toHaveBeenCalledTimes(
      error === 'exceeded the line protocol limits' ? 0 : 1,
    )
  })

  it('does not start the schema fallback after an aborted text request', async () => {
    const generateObject = mockGenerateObject(ok(progressiveOutlineFor(createBenchmarkPlan())))
    const generateText = mockGenerateText(err('AbortError: operation aborted'))

    const result = await planPrototype(fakeGeneration(generateObject, generateText), {
      providerId: 'p',
      model: 'm',
      brief: PROGRESSIVE_TEST_BRIEF,
    })

    expect(result).toEqual(err('AbortError: operation aborted'))
    expect(generateText).toHaveBeenCalledTimes(1)
    expect(generateObject).not.toHaveBeenCalled()
  })

  it('settles the outline deadline when the stream iterator ignores abort', async () => {
    vi.useFakeTimers()
    try {
      let streamSignal: AbortSignal | undefined
      const generateObject = mockGenerateObject(ok(progressiveOutlineFor(createBenchmarkPlan())))
      const generation = {
        generateObject,
        async *streamText(input: GenerateInput) {
          streamSignal = input.signal
          await new Promise<never>(() => {})
          yield ''
        },
      } as Pick<GenerationService, 'generateObject' | 'streamText'>

      const pending = planPrototype(generation, {
        providerId: 'p',
        model: 'm',
        brief: PROGRESSIVE_TEST_BRIEF,
      })
      await vi.advanceTimersByTimeAsync(120_000)

      await expect(pending).resolves.toEqual(err(
        'Progressive planner outline timed out.',
      ))
      expect(streamSignal?.aborted).toBe(true)
      expect(generateObject).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('preserves a transport failure from the text fallback', async () => {
    const generateObject = mockGenerateObject(ok(progressiveOutlineFor(createBenchmarkPlan())))
    const generateText = mockGenerateText(err('request failed: operation timed out'))

    const result = await planPrototype(fakeGeneration(generateObject, generateText), {
      providerId: 'p',
      model: 'm',
      brief: PROGRESSIVE_TEST_BRIEF,
    })

    expect(result).toEqual(err('Progressive planner outline transport failed.'))
    expect(generateObject).not.toHaveBeenCalled()
    expect(generateText).toHaveBeenCalledTimes(1)
  })

  it('reports bounded progressive page progress and preserves the failed stage', async () => {
    const plan = createBenchmarkPlan()
    const onProgress = vi.fn()
    const generateObject = mockGenerateSequence(
      ok(progressiveDesignFoundationFor(plan)),
      ok(progressiveDesignExplorationFor(plan)),
      ok(plan.pages[0]!),
      err('Structured JSON generation failed: response did not match schema'),
    )

    const result = await planPrototype(fakeGeneration(
      generateObject,
      mockGenerateText(ok(progressiveOutlineProtocolFor(plan))),
    ), {
      providerId: 'p',
      model: 'm',
      brief: PROGRESSIVE_TEST_BRIEF,
      onProgress,
    })

    expect(result).toEqual(err(
      'Progressive planner page structured output failed: Structured JSON generation failed: response did not match schema',
    ))
    expect(onProgress).toHaveBeenNthCalledWith(1, {
      stage: 'outline', completedPages: 0, totalPages: 0,
    })
    expect(onProgress).toHaveBeenLastCalledWith({
      stage: 'page', completedPages: 1, totalPages: 6,
    })
  })

  it('rejects progressive page expansion that changes route outline identity', async () => {
    const plan = createBenchmarkPlan()
    const changedPages = plan.pages.map((page, index) => index === 2
      ? { ...page, purpose: 'A changed purpose.' }
      : page)
    const generateObject = mockGenerateSequence(
      ok(progressiveDesignFoundationFor(plan)),
      ok(progressiveDesignExplorationFor(plan)),
      ...changedPages.map((page) => ok(page)),
    )
    const result = await planPrototype(fakeGeneration(
      generateObject,
      mockGenerateText(ok(progressiveOutlineProtocolFor(plan))),
    ), {
      providerId: 'p',
      model: 'm',
      brief: PROGRESSIVE_TEST_BRIEF,
    })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain(
      'changed route identity for page-3',
    )
    expect(generateObject).toHaveBeenCalledTimes(5)
  })

  it('rejects progressive page expansion that changes viewport', async () => {
    const plan = createBenchmarkPlan()
    const changedViewport = plan.pages.map((page, index) => index === 1
      ? { ...page, viewport: { ...page.viewport, width: 1280 } }
      : page)
    const viewportGeneration = mockGenerateSequence(
      ok(progressiveDesignFoundationFor(plan)),
      ok(progressiveDesignExplorationFor(plan)),
      ...changedViewport.map((page) => ok(page)),
    )
    const viewportResult = await planPrototype(fakeGeneration(
      viewportGeneration,
      mockGenerateText(ok(progressiveOutlineProtocolFor(plan))),
    ), {
      providerId: 'p',
      model: 'm',
      brief: PROGRESSIVE_TEST_BRIEF,
    })

    expect(viewportResult.ok).toBe(false)
    expect(!viewportResult.ok && viewportResult.error).toContain(
      'changed viewport for page-2',
    )
  })

  it('rejects invalid progressive closure references at the final plan boundary', async () => {
    const plan = createBenchmarkPlan()
    const closure = progressiveClosureFor(plan)
    const generateObject = mockGenerateSequence(
      ok(progressiveDesignFoundationFor(plan)),
      ok(progressiveDesignExplorationFor(plan)),
      ...plan.pages.map((page) => ok(page)),
      ok({
        ...closure,
        flows: [{
          ...closure.flows[0]!,
          steps: [{
            fromPageId: 'page-1',
            interactionId: 'missing-interaction',
            toPageId: 'page-2',
          }],
        }],
      }),
    )
    const result = await planPrototype(fakeGeneration(
      generateObject,
      mockGenerateText(ok(progressiveOutlineProtocolFor(plan))),
    ), {
      providerId: 'p',
      model: 'm',
      brief: PROGRESSIVE_TEST_BRIEF,
    })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain(
      'step references unknown interaction "missing-interaction"',
    )
  })

  it('fails closed when a progressive stage reports a credential error', async () => {
    const generateObject = mockGenerateSequence(
      err('API_KEY_REQUIRED'),
    )
    const result = await planPrototype(fakeGeneration(generateObject), {
      providerId: 'p',
      model: 'm',
      brief: 'Create a complete prototype suite.',
    })

    expect(result).toEqual(err('API_KEY_REQUIRED'))
    expect(generateObject).toHaveBeenCalledTimes(1)
  })

  it('creates a valid local prototype plan from the brief', () => {
    const plan = createLocalPrototypePlan('cat store')

    expect(plan.product.name).toBe('cat store')
    expect(plan.designSystem.palette).toContain('soft peach')
    expect(plan.pages.map(prototypePageAssetCount)).toEqual([0])
    expect(plan.pages[0]!.regions.every((region) =>
      region.assetRoute === 'ignore-code-ui' && region.assetOpportunities.length === 0,
    )).toBe(true)
    expect(validatePrototypePlan(plan).ok).toBe(true)
  })

  it('closes an Agent-authored planning seed into distinct complete suites', () => {
    const seed: PrototypePlanningSeed = {
      product: {
        name: 'Roam',
        projectName: 'Roam',
        summary: 'A calm travel planning workspace.',
        audience: 'Independent travelers',
        primaryGoal: 'Turn saved places into a coherent trip.',
        platform: 'responsive web app',
      },
      rationale: 'Compare three distinct ways to move from inspiration to itinerary.',
      suites: ['editorial', 'atlas', 'operations'].map((direction, suiteIndex) => ({
        direction: {
          id: direction,
          label: `${direction} direction`,
          thesis: `${direction} travel planning thesis`,
          vary: [`${direction} information architecture`],
          preserve: ['calm travel intent'],
        },
        pages: Array.from({ length: 6 }, (_, pageIndex) => ({
          id: `${direction}-${pageIndex + 1}`,
          name: `${direction} page ${pageIndex + 1}`,
          route: `/suite-${suiteIndex + 1}/page-${pageIndex + 1}`,
          purpose: `Complete stage ${pageIndex + 1} of the ${direction} journey.`,
          viewport: {
            platform: 'desktop',
            width: 1440,
            height: 1000,
            scroll: 'long-scroll' as const,
          },
          materials: [],
        })),
      })),
    }

    const plans = seed.suites.map(({ direction }) =>
      createPrototypePlanFromSeed(seed, direction.id))

    expect(plans.map((plan) => plan.pages.length)).toEqual([6, 6, 6])
    expect(plans.map((plan) => plan.designSystem.exploration?.count)).toEqual([3, 3, 3])
    expect(plans.every((plan) => plan.planningSeed === seed)).toBe(false)
    expect(plans.every((plan) => plan.planningSeed?.suites.length === 3)).toBe(true)
    expect(plans.every((plan) => validatePrototypePlan(plan).ok)).toBe(true)
    expect(plans.flatMap((plan) =>
      plan.pages.map((page) => prototypePageAssetCount(page))),
    ).toEqual(Array.from({ length: 18 }, () => 0))
    expect(plans.flatMap((plan) => plan.pages).every((page) =>
      page.regions.filter((region) => region.assetRoute === 'board-cutout').length === 0
      && page.regions.filter((region) => region.assetRoute === 'direct-generate').length === 0
      && page.regions.every((region) => region.assetRoute === 'ignore-code-ui')
    )).toBe(true)
    expect(new Set(plans.map((plan) =>
      JSON.stringify(plan.pages.map((page) => page.route)))).size).toBe(3)
  })

  it('closes variable board-grouped and direct materials without adding a fixed quota', () => {
    const seed: PrototypePlanningSeed = {
      product: {
        name: 'Field Notes',
        projectName: 'Field Notes',
        summary: 'A route journal for urban walks.',
        audience: 'Independent walkers',
        primaryGoal: 'Turn observations into reusable route stories.',
        platform: 'responsive web app',
      },
      rationale: 'Each route keeps only visual materials with genuine downstream reuse value.',
      suites: [{
        direction: {
          id: 'editorial',
          label: 'Editorial field guide',
          thesis: 'Let place identity and observations drive the experience.',
          vary: ['material density'],
          preserve: ['route accuracy'],
        },
        pages: [
          {
            id: 'route-index',
            name: 'Route index',
            route: '/routes',
            purpose: 'Browse saved routes using code-reproducible list UI.',
            viewport: {
              platform: 'desktop', width: 1440, height: 1000, scroll: 'long-scroll',
            },
            materials: [],
          },
          {
            id: 'route-story',
            name: 'Route story',
            route: '/routes/story',
            purpose: 'Read one route and reuse its atomic place markers.',
            viewport: {
              platform: 'desktop', width: 1440, height: 1000, scroll: 'long-scroll',
            },
            materials: [
              {
                id: 'cafe-marker',
                name: 'Cafe marker',
                description: 'Reusable illustrated cafe location marker.',
                production: 'board-cutout',
                boardGroupId: 'food-markers',
              },
              {
                id: 'gallery-marker',
                name: 'Gallery marker',
                description: 'Reusable illustrated gallery location marker.',
                production: 'board-cutout',
                boardGroupId: 'culture-markers',
              },
              {
                id: 'park-marker',
                name: 'Park marker',
                description: 'Reusable illustrated park location marker.',
                production: 'board-cutout',
                boardGroupId: 'culture-markers',
              },
            ],
          },
          {
            id: 'route-map',
            name: 'Route map',
            route: '/routes/story/map',
            purpose: 'Inspect art-directed maps that cannot be rebuilt as ordinary UI.',
            viewport: {
              platform: 'desktop', width: 1440, height: 1000, scroll: 'single-screen',
            },
            materials: [
              {
                id: 'day-map',
                name: 'Day route map',
                description: 'Art-directed illustrated map for the daytime walk.',
                production: 'direct-generate',
              },
              {
                id: 'night-map',
                name: 'Night route map',
                description: 'Art-directed illustrated map for the nighttime walk.',
                production: 'direct-generate',
              },
            ],
          },
        ],
      }],
    }

    const plan = createPrototypePlanFromSeed(seed)
    const [zeroPage, boardPage, directPage] = plan.pages

    expect(zeroPage && prototypePageAssetCount(zeroPage)).toBe(0)
    expect(zeroPage?.regions.every((region) => region.assetRoute === 'ignore-code-ui')).toBe(true)

    const boardRegions = boardPage?.regions.filter(
      (region) => region.assetRoute === 'board-cutout',
    ) ?? []
    expect(boardRegions).toHaveLength(2)
    expect(boardRegions.map((region) => region.assetOpportunities.length)).toEqual([1, 2])
    expect(boardRegions.map((region) => region.name)).toEqual([
      'Reusable visual materials: food-markers',
      'Reusable visual materials: culture-markers',
    ])
    expect(boardPage && prototypePageAssetCount(boardPage)).toBe(3)

    const directRegions = directPage?.regions.filter(
      (region) => region.assetRoute === 'direct-generate',
    ) ?? []
    expect(directRegions).toHaveLength(2)
    expect(directRegions.every((region) => region.assetOpportunities.length === 1)).toBe(true)
    expect(directPage && prototypePageAssetCount(directPage)).toBe(2)
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
