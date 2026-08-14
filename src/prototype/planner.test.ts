import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { err, ok, type Result } from '@/services/types'
import type { GenerateInput, GenerationService } from '@/services/ai/types'
import type { IntentProfile } from '@/dag/intent-types'
import { tauriBridge } from '@/platform/native'
import {
  composePrototypeRequirement,
  createLocalPrototypePlan,
  explicitPrototypePageCount,
  planPrototype,
  PROTOTYPE_DESIGN_SYSTEM_MAX_PARALLELISM,
  PROGRESSIVE_OUTLINE_TEXT_MAX_BYTES,
  PROTOTYPE_PLANNER_PAGE_MAX_PARALLELISM,
  PROTOTYPE_PLANNER_STAGE_TIMEOUT_MS,
  PROTOTYPE_PLANNER_TOTAL_TIMEOUT_MS,
  progressivePlannerTimeoutMs,
} from './planner'
import {
  generatedPrototypePlanSchema,
  validatePrototypePlan,
  type PrototypePlan,
} from './prototype-plan'
import { prototypePageAssetCount } from './asset-manifest'
import { currentPrototypeExploration } from './prototype-plan.test-fixture'
import { packagedE2eFailureDiagnostic } from '@/packaged-e2e/failure-diagnostic'

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
          sourceSectionId: undefined,
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
        bounds: {
          maxCandidates: 8,
          maxParallelism: PROTOTYPE_DESIGN_SYSTEM_MAX_PARALLELISM,
        },
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
    entryPageIds: plan.flows.map(({ startPageId }) => startPageId),
    edges: plan.pages.flatMap((page) => page.interactions.flatMap((interaction) =>
      interaction.action.type === 'navigate'
        ? [{
            id: interaction.id,
            fromPageId: page.id,
            toPageId: interaction.action.targetPageId,
            label: interaction.label,
            trigger: interaction.trigger,
            sourceElement: interaction.sourceElement,
            intent: interaction.intent,
          }]
        : [])),
    humanLoop: plan.humanLoop,
  }
}

function progressiveOutlineProtocolFor(plan: PrototypePlan): string {
  const lines = [
    'CUTOUT_OUTLINE_V2',
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
    ...plan.flows.map(({ startPageId }) => ['ENTRY', startPageId].join('\t')),
    ...plan.pages.flatMap((page) => page.interactions.flatMap((interaction) =>
      interaction.action.type === 'navigate'
        ? [[
            'EDGE',
            interaction.id,
            page.id,
            interaction.action.targetPageId,
            interaction.label,
            interaction.trigger,
            interaction.sourceElement,
            interaction.intent,
          ].join('\t')]
        : [])),
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

function progressivePlanFor(plan: PrototypePlan): PrototypePlan {
  const outline = progressiveOutlineFor(plan)
  const pageById = new Map(outline.pages.map((page) => [page.id, page]))
  const edgeLines = outline.edges.map((edge) => {
    const source = pageById.get(edge.fromPageId)!
    const target = pageById.get(edge.toPageId)!
    return `- ${source.name} (${source.route}) -- ${edge.label} --> ${target.name} (${target.route})`
  })
  const routeLines = outline.pages.map((page) => `- ${page.name} (${page.route}): ${page.purpose}`)
  const entryLines = outline.entryPageIds.map((pageId) => {
    const page = pageById.get(pageId)!
    return `- ${page.name} (${page.route})`
  })
  return {
    ...plan,
    pages: plan.pages.map((page) => ({
      ...page,
      interactions: [
        ...page.interactions.filter(({ action }) => action.type !== 'navigate'),
        ...outline.edges.filter(({ fromPageId }) => fromPageId === page.id).map((edge) => ({
          id: edge.id,
          label: edge.label,
          trigger: edge.trigger,
          sourceElement: edge.sourceElement,
          intent: edge.intent,
          action: { type: 'navigate' as const, targetPageId: edge.toPageId },
        })),
      ],
    })),
    flows: outline.entryPageIds.map((startPageId, index) => ({
      id: `route-journey-${index + 1}`,
      name: `Route journey ${index + 1}`,
      goal: outline.product.primaryGoal,
      startPageId,
      steps: outline.edges.map((edge) => ({
        fromPageId: edge.fromPageId,
        interactionId: edge.id,
        toPageId: edge.toPageId,
      })),
    })),
    reviewDocument: {
      format: 'markdown',
      primaryFlow: [
        `# ${outline.product.name} primary journey`,
        '',
        `Goal: ${outline.product.primaryGoal}`,
        '',
        'Entry routes:',
        ...entryLines,
        '',
        'Authoritative navigation:',
        ...(edgeLines.length > 0 ? edgeLines : ['- No cross-route navigation is required.']),
      ].join('\n'),
      fullPlan: [
        `# ${outline.product.name} route plan`,
        '',
        outline.product.summary,
        '',
        'Routes:',
        ...routeLines,
        '',
        'Journey entries:',
        ...entryLines,
        '',
        'Authoritative navigation:',
        ...(edgeLines.length > 0 ? edgeLines : ['- No cross-route navigation is required.']),
      ].join('\n'),
    },
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
    expect(explicitPrototypePageCount('钻石王老五只需要一个页面')).toBe(1)
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
      brief: 'Build three pages for a restaurant site, but cover the complete ordering journey.',
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
    const onProgress = vi.fn()
    const result = await planPrototype(fakeGeneration(generateObject), {
      providerId: 'chat',
      model: 'gpt-5.5',
      brief: '为脱衣舞娘俱乐部设计两个页面',
      onProgress,
    })

    expect(result).toEqual(ok(samplePlan))
    expect(result.ok && result.data.reviewDocument?.fullPlan).toContain('all planned surfaces')
    const [input, schema] = generateObject.mock.calls[0]
    expect(input.promptRef).toEqual({ id: 'ui-prototype-planner' })
    expect(input.model).toBe('gpt-5.5')
    expect(input.input?.[0]).toEqual({
      type: 'text',
      text: '为脱衣舞娘俱乐部设计两个页面',
    })
    expect(schema).toBe(generatedPrototypePlanSchema)
    expect(onProgress).toHaveBeenCalledOnce()
    expect(onProgress).toHaveBeenCalledWith({
      stage: 'complete',
      completedPages: samplePlan.pages.length,
      totalPages: samplePlan.pages.length,
    })
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
      brief: '为夜店设计两个页面',
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
      brief: 'Build one page.',
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
      brief: 'Build one page for a wealthy bachelor.',
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
      brief: 'Build one page for a wealthy bachelor.',
    })

    expect(result).toEqual(err('request failed: operation timed out'))
  })

  it.each([
    'Structured output failed: native-schema=transport.',
    'Structured output failed: native-schema=rate-limited.',
    'Structured output failed: native-schema=authentication.',
    'Structured output failed: native-schema=policy.',
    'Structured output failed: native-schema=aborted.',
  ])('does not start progressive recovery for a terminal structured failure: %s', async (failure) => {
    const generateObject = mockGenerateObject(err(failure))
    const generateText = mockGenerateText(ok('unexpected progressive output'))
    const result = await planPrototype(fakeGeneration(generateObject, generateText), {
      providerId: 'p',
      model: 'm',
      brief: 'Build one page for a focused tool.',
    })

    expect(result).toEqual(err(failure))
    expect(generateObject).toHaveBeenCalledTimes(1)
    expect(generateText).not.toHaveBeenCalled()
  })

  it('propagates provider auth failures without inventing topology', async () => {
    const generateObject = mockGenerateObject(err('API_KEY_REQUIRED'))
    const result = await planPrototype(fakeGeneration(generateObject), {
      providerId: 'p',
      model: 'm',
      brief: 'Build one page for a wealthy bachelor.',
    })

    expect(result).toEqual(err('API_KEY_REQUIRED'))
  })

  it('preserves heterogeneous Agent-authored material scope progressively', async () => {
    const plan = createBenchmarkPlan()
    const expected = progressivePlanFor(plan)
    const generateObject = mockGenerateSequence(
      ok(progressiveDesignFoundationFor(plan)),
      ok(progressiveDesignExplorationFor(plan)),
      ...plan.pages.map((page) => ok(page)),
    )
    const generateText = mockGenerateText(ok(progressiveOutlineProtocolFor(plan)))
    const result = await planPrototype(fakeGeneration(generateObject, generateText), {
      providerId: 'p',
      model: 'm',
      brief: PROGRESSIVE_TEST_BRIEF,
    })

    expect(result).toEqual(ok(expected))
    expect(generateObject).toHaveBeenCalledTimes(8)
    expect(generateObject.mock.calls.map(([input]) => input.maxOutputTokens)).toEqual([
      8_000,
      8_000,
      12_000,
      12_000,
      12_000,
      12_000,
      12_000,
      12_000,
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

  it('outlines a natural business intent before any structured expansion', async () => {
    const plan = createBenchmarkPlan()
    const expected = progressivePlanFor(plan)
    const generateObject = mockGenerateSequence(
      ok(progressiveDesignFoundationFor(plan)),
      ok(progressiveDesignExplorationFor(plan)),
      ...plan.pages.map((page) => ok(page)),
    )
    const generateText = mockGenerateText(ok(progressiveOutlineProtocolFor(plan)))

    const result = await planPrototype(fakeGeneration(generateObject, generateText), {
      providerId: 'p',
      model: 'm',
      brief: '为一家现代餐厅设计完整官网，覆盖顾客从了解品牌到到店用餐的真实旅程。',
    })

    expect(result).toEqual(ok(expected))
    expect(generateText).toHaveBeenCalledTimes(1)
    expect(generateObject).toHaveBeenCalledTimes(2 + plan.pages.length)
    expect(generateText.mock.invocationCallOrder[0])
      .toBeLessThan(generateObject.mock.invocationCallOrder[0]!)
    expect(generateObject.mock.calls[0]![1]).not.toBe(generatedPrototypePlanSchema)
  })

  it('expands independent route pages with bounded parallelism', async () => {
    const plan = createBenchmarkPlan()
    const expected = progressivePlanFor(plan)
    let objectCall = 0
    let activePages = 0
    let maximumActivePages = 0
    const generateObject = vi.fn(async <T,>(
      _input: GenerateInput,
      _schema: z.ZodType<T>,
    ): Promise<Result<T>> => {
      const call = objectCall
      objectCall += 1
      if (call === 0) return ok(progressiveDesignFoundationFor(plan)) as Result<T>
      if (call === 1) return ok(progressiveDesignExplorationFor(plan)) as Result<T>
      activePages += 1
      maximumActivePages = Math.max(maximumActivePages, activePages)
      await Promise.resolve()
      activePages -= 1
      return ok(plan.pages[call - 2]!) as Result<T>
    })

    const result = await planPrototype(fakeGeneration(
      generateObject,
      mockGenerateText(ok(progressiveOutlineProtocolFor(plan))),
    ), {
      providerId: 'p',
      model: 'm',
      brief: PROGRESSIVE_TEST_BRIEF,
    })

    expect(result).toEqual(ok(expected))
    expect(maximumActivePages).toBe(PROTOTYPE_PLANNER_PAGE_MAX_PARALLELISM)
  })

  it('lets a single-turn runtime serialize pages before stage deadlines begin', async () => {
    const plan = createBenchmarkPlan()
    const expected = progressivePlanFor(plan)
    let objectCall = 0
    let activePages = 0
    let maximumActivePages = 0
    const generateObject = vi.fn(async <T,>(
      _input: GenerateInput,
      _schema: z.ZodType<T>,
    ): Promise<Result<T>> => {
      const call = objectCall++
      if (call === 0) return ok(progressiveDesignFoundationFor(plan)) as Result<T>
      if (call === 1) return ok(progressiveDesignExplorationFor(plan)) as Result<T>
      activePages += 1
      maximumActivePages = Math.max(maximumActivePages, activePages)
      await Promise.resolve()
      activePages -= 1
      return ok(plan.pages[call - 2]!) as Result<T>
    })

    const result = await planPrototype(fakeGeneration(
      generateObject,
      mockGenerateText(ok(progressiveOutlineProtocolFor(plan))),
    ), {
      providerId: 'codex-system',
      brief: PROGRESSIVE_TEST_BRIEF,
      pageParallelism: 1,
    })

    expect(result).toEqual(ok(expected))
    expect(maximumActivePages).toBe(1)
  })

  it('rejects unsupported runtime page parallelism before a Provider call', async () => {
    const generateObject = mockGenerateObject(ok(samplePlan))
    const result = await planPrototype(fakeGeneration(generateObject), {
      providerId: 'p',
      brief: PROGRESSIVE_TEST_BRIEF,
      pageParallelism: PROTOTYPE_PLANNER_PAGE_MAX_PARALLELISM + 1,
    })
    expect(result).toEqual(err('Prototype planner page parallelism is outside the supported range.'))
    expect(generateObject).not.toHaveBeenCalled()
  })

  it('parses a bounded Agent-authored six-route outline before schema generation', async () => {
    const plan = createBenchmarkPlan()
    const expected = progressivePlanFor(plan)
    const generateObject = mockGenerateSequence(
      ok(progressiveDesignFoundationFor(plan)),
      ok(progressiveDesignExplorationFor(plan)),
      ...plan.pages.map((page) => ok(page)),
    )
    const generateText = mockGenerateText(ok(progressiveOutlineProtocolFor(plan)))

    const result = await planPrototype(fakeGeneration(generateObject, generateText), {
      providerId: 'p',
      model: 'm',
      brief: PROGRESSIVE_TEST_BRIEF,
    })

    expect(result).toEqual(ok(expected))
    expect(generateText).toHaveBeenCalledTimes(1)
    expect(generateText.mock.calls[0]![0].maxOutputTokens).toBe(4_000)
    expect(generateText.mock.calls[0]![0].system).toContain('CUTOUT_OUTLINE_V2')
    expect(generateObject.mock.calls[0]![0].system).toContain('Design System architect')
    const foundationInput = generateObject.mock.calls[0]![0].input?.[0]
    expect(foundationInput?.type === 'text' ? foundationInput.text : '')
      .toContain('"entryPageIds":["page-1"]')
    expect(result.ok && result.data.pages.map((page) => page.route)).toEqual(
      plan.pages.map((page) => page.route),
    )
  })

  it('accepts the maximal bounded V2 topology without a structured fallback', async () => {
    const benchmark = createBenchmarkPlan()
    const pages = Array.from(
      { length: 12 },
      (_, index): PrototypePlan['pages'][number] => {
        const pageNumber = index + 1
        return {
          ...benchmark.pages[index % benchmark.pages.length]!,
          id: `max-page-${pageNumber}`,
          name: `Maximum page ${pageNumber}`,
          route: pageNumber === 1 ? '/' : `/maximum-${pageNumber}`,
          purpose: `Serve maximum topology route ${pageNumber}.`,
          regions: [{
            ...benchmark.pages[index % benchmark.pages.length]!.regions[0]!,
            id: `max-region-${pageNumber}`,
          }],
          interactions: Array.from({ length: 4 }, (_, edgeIndex) => ({
            ...benchmark.pages[0]!.interactions[0]!,
            id: `max-edge-${pageNumber}-${edgeIndex + 1}`,
            sourceSectionId: undefined,
            action: {
              type: 'navigate' as const,
              targetPageId: `max-page-${((index + edgeIndex + 1) % 12) + 1}`,
            },
          })),
        }
      },
    )
    const plan: PrototypePlan = {
      ...benchmark,
      pages,
      flows: pages.map((page, index) => ({
        id: `max-flow-${index + 1}`,
        name: `Maximum flow ${index + 1}`,
        goal: `Enter maximum route ${index + 1}.`,
        startPageId: page.id,
        steps: [],
      })),
      humanLoop: {
        mode: 'ask',
        rationale: 'One product decision changes the route content.',
        question: 'Which content mode should lead?',
        choices: Array.from({ length: 4 }, (_, index) => ({
          id: `mode-${index + 1}`,
          label: `Mode ${index + 1}`,
          description: `Use content mode ${index + 1}.`,
          impact: `Route content follows mode ${index + 1}.`,
        })),
        defaultChoiceId: 'mode-1',
      },
    }
    const generateObject = mockGenerateObject(
      err('Structured JSON generation failed: response did not match schema'),
    )

    const result = await planPrototype(fakeGeneration(
      generateObject,
      mockGenerateText(ok(progressiveOutlineProtocolFor(plan))),
    ), {
      providerId: 'p',
      model: 'm',
      brief: 'Plan the complete maximum bounded route topology.',
    })

    expect(result.ok && result.data.pages).toHaveLength(12)
    expect(result.ok && result.data.humanLoop).toEqual(plan.humanLoop)
    expect(generateObject).not.toHaveBeenCalled()
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
    )
    const result = await planPrototype(fakeGeneration(
      generateObject,
      mockGenerateText(ok(progressiveOutlineProtocolFor(plan))),
    ), {
      providerId: 'p',
      model: 'm',
      brief: `${PROGRESSIVE_TEST_BRIEF} Cover the complete journey.`,
    })

    expect(result).toEqual(ok(progressivePlanFor(plan)))
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

  it('accepts exactly one fenced closed outline protocol from compatible text routes', async () => {
    const plan = createBenchmarkPlan()
    const generateObject = mockGenerateSequence(
      ok(progressiveDesignFoundationFor(plan)),
      ok(progressiveDesignExplorationFor(plan)),
      ...plan.pages.map((page) => ok(page)),
    )
    const result = await planPrototype(fakeGeneration(
      generateObject,
      mockGenerateText(ok(`\n\`\`\`tsv\n${progressiveOutlineProtocolFor(plan)}\n\`\`\`\n`)),
    ), {
      providerId: 'p',
      model: 'm',
      brief: PROGRESSIVE_TEST_BRIEF,
    })

    expect(result).toEqual(ok(progressivePlanFor(plan)))
    expect(generateObject).toHaveBeenCalledTimes(2 + plan.pages.length)
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
      name: 'duplicate page ids',
      outline: (plan: PrototypePlan) => ({
        ...progressiveOutlineFor(plan),
        pages: progressiveOutlineFor(plan).pages.map((page, index) =>
          index === 1 ? { ...page, id: plan.pages[0]!.id } : page),
      }),
    },
    {
      name: 'duplicate routes',
      outline: (plan: PrototypePlan) => ({
        ...progressiveOutlineFor(plan),
        pages: progressiveOutlineFor(plan).pages.map((page, index) =>
          index === 1 ? { ...page, route: plan.pages[0]!.route } : page),
      }),
    },
    {
      name: 'disconnected pages',
      outline: (plan: PrototypePlan) => ({
        ...progressiveOutlineFor(plan),
        edges: progressiveOutlineFor(plan).edges.slice(0, 1),
      }),
    },
  ])('rejects a structured outline with $name before page expansion', async ({ outline }) => {
    const plan = createBenchmarkPlan()
    const generateObject = vi.fn(async <T,>(
      _input: GenerateInput,
      schema: z.ZodType<T>,
    ): Promise<Result<T>> => {
      const parsed = schema.safeParse(outline(plan))
      return parsed.success
        ? ok(parsed.data)
        : err('Structured JSON generation failed: response did not match schema')
    })
    const result = await planPrototype(fakeGeneration(
      generateObject,
      mockGenerateText(ok('not-the-closed-protocol')),
    ), {
      providerId: 'p',
      model: 'm',
      brief: PROGRESSIVE_TEST_BRIEF,
    })

    expect(result.ok).toBe(false)
    expect(generateObject).toHaveBeenCalledTimes(1)
  })

  it('compiles exact outline navigation and discards page-authored navigate drift', async () => {
    const plan = createBenchmarkPlan()
    const expected = progressivePlanFor(plan)
    const driftedPages = plan.pages.map((page, index) => ({
      ...page,
      interactions: index === 0
        ? [{
            ...page.interactions[0]!,
            id: 'invented-navigation',
            action: { type: 'navigate' as const, targetPageId: 'page-6' },
          }]
        : page.interactions,
    }))
    const generateObject = mockGenerateSequence(
      ok(progressiveDesignFoundationFor(plan)),
      ok(progressiveDesignExplorationFor(plan)),
      ...driftedPages.map((page) => ok(page)),
    )
    const result = await planPrototype(fakeGeneration(
      generateObject,
      mockGenerateText(ok(progressiveOutlineProtocolFor(plan))),
    ), {
      providerId: 'p',
      model: 'm',
      brief: PROGRESSIVE_TEST_BRIEF,
    })

    expect(result).toEqual(ok(expected))
    expect(result.ok && result.data.pages[0]!.interactions).toEqual(
      plan.pages[0]!.interactions,
    )
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
      output: (plan: PrototypePlan) => `${progressiveOutlineProtocolFor(plan)}${'R'.repeat(PROGRESSIVE_OUTLINE_TEXT_MAX_BYTES)}`,
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

  it('settles a structured planning stage whose transport ignores abort', async () => {
    vi.useFakeTimers()
    try {
      let stageSignal: AbortSignal | undefined
      const generation = {
        async generateObject<T>(input: GenerateInput, _schema: z.ZodType<T>): Promise<Result<T>> {
          stageSignal = input.signal
          return new Promise<Result<T>>(() => {})
        },
        async *streamText() {
          yield await Promise.reject(new Error('Unexpected progressive planner call.'))
        },
      } as Pick<GenerationService, 'generateObject' | 'streamText'>

      const pending = planPrototype(generation, {
        providerId: 'p',
        model: 'm',
        brief: 'Plan one page for a focused single-screen tool.',
      })
      await vi.advanceTimersByTimeAsync(PROTOTYPE_PLANNER_STAGE_TIMEOUT_MS)

      await expect(pending).resolves.toEqual(err('Prototype planner plan timed out.'))
      expect(stageSignal?.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('settles from the native monotonic deadline when renderer timers are disabled', async () => {
    let settleStage!: () => void
    const stageDeadline = new Promise<void>((resolve) => {
      settleStage = resolve
    })
    const never = new Promise<void>(() => {})
    const nativeWait = vi.spyOn(tauriBridge, 'waitForMonotonicDeadline')
      .mockImplementation((_deadlineId, timeoutMs) =>
        timeoutMs === PROTOTYPE_PLANNER_STAGE_TIMEOUT_MS ? stageDeadline : never)
    vi.spyOn(tauriBridge, 'cancelMonotonicDeadline').mockResolvedValue(undefined)
    vi.stubGlobal('__TAURI_INTERNALS__', { invoke: vi.fn() })
    const rendererTimer = vi.spyOn(globalThis, 'setTimeout')
      .mockImplementation(() => 0 as never)
    try {
      let stageSignal: AbortSignal | undefined
      const generation = {
        async generateObject<T>(input: GenerateInput): Promise<Result<T>> {
          stageSignal = input.signal
          return new Promise<Result<T>>(() => {})
        },
        async *streamText() {
          yield await Promise.reject(new Error('Unexpected progressive planner call.'))
        },
      } as Pick<GenerationService, 'generateObject' | 'streamText'>

      const pending = planPrototype(generation, {
        providerId: 'p',
        model: 'm',
        brief: 'Plan one page for a focused single-screen tool.',
      })
      expect(nativeWait).toHaveBeenCalledWith(
        expect.any(String),
        PROTOTYPE_PLANNER_TOTAL_TIMEOUT_MS,
      )
      expect(nativeWait).toHaveBeenCalledWith(
        expect.any(String),
        PROTOTYPE_PLANNER_STAGE_TIMEOUT_MS,
      )
      expect(rendererTimer).not.toHaveBeenCalled()

      settleStage()

      await expect(pending).resolves.toEqual(err('Prototype planner plan timed out.'))
      expect(stageSignal?.aborted).toBe(true)
    } finally {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    }
  })

  it('preserves parent cancellation before an outstanding deadline', async () => {
    const parent = new AbortController()
    let stageSignal: AbortSignal | undefined
    const generation = {
      async generateObject<T>(input: GenerateInput): Promise<Result<T>> {
        stageSignal = input.signal
        return new Promise<Result<T>>(() => {})
      },
      async *streamText() {
        yield await Promise.reject(new Error('Unexpected progressive planner call.'))
      },
    } as Pick<GenerationService, 'generateObject' | 'streamText'>

    const pending = planPrototype(generation, {
      providerId: 'p',
      model: 'm',
      brief: 'Plan one page for a focused single-screen tool.',
      signal: parent.signal,
    })
    parent.abort()

    await expect(pending).resolves.toEqual(err('AbortError: operation aborted'))
    expect(stageSignal?.aborted).toBe(true)
  })

  it('bounds the complete progressive planning journey across successful stages', async () => {
    vi.useFakeTimers()
    try {
      const plan = createBenchmarkPlan()
      let objectCall = 0
      let latestSignal: AbortSignal | undefined
      const generation = {
        async generateObject<T>(input: GenerateInput, _schema: z.ZodType<T>): Promise<Result<T>> {
          latestSignal = input.signal
          const call = objectCall
          objectCall += 1
          await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 160_000))
          const value = call === 0
            ? progressiveDesignFoundationFor(plan)
            : progressiveDesignExplorationFor(plan)
          return ok(value) as Result<T>
        },
        async *streamText() {
          yield progressiveOutlineProtocolFor(plan)
        },
      } as Pick<GenerationService, 'generateObject' | 'streamText'>

      const pending = planPrototype(generation, {
        providerId: 'p',
        model: 'm',
        brief: PROGRESSIVE_TEST_BRIEF,
      })
      const budget = progressivePlannerTimeoutMs(
        plan.pages.length,
        PROTOTYPE_PLANNER_PAGE_MAX_PARALLELISM,
      )
      await vi.advanceTimersByTimeAsync(budget)

      await expect(pending).resolves.toEqual(err('Prototype planning timed out.'))
      // The bounded budget scales with the resolved graph, so it can advance
      // into page expansion before it cancels the complete journey.
      expect(objectCall).toBeGreaterThan(2)
      expect(latestSignal?.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('derives progressive budget from the resolved topology and runtime parallelism', () => {
    expect(progressivePlannerTimeoutMs(1, 3)).toBe(PROTOTYPE_PLANNER_TOTAL_TIMEOUT_MS + 30_000)
    expect(progressivePlannerTimeoutMs(11, 1)).toBe(10 * 60_000)
    expect(progressivePlannerTimeoutMs(11, 3)).toBe(PROTOTYPE_PLANNER_TOTAL_TIMEOUT_MS + 120_000)
    expect(() => progressivePlannerTimeoutMs(13)).toThrow('page count')
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

  it(
    'preserves structured transient fallback authority after a malformed streamed outline',
    async () => {
      const structuredTransport =
        'Structured output failed: native-schema=invalid-json; forced-tool=transport.'
      const generateObject = mockGenerateObject(err(structuredTransport))
      const generateText = mockGenerateText(ok('not-the-closed-protocol'))

      const result = await planPrototype(fakeGeneration(generateObject, generateText), {
        providerId: 'p',
        model: 'm',
        brief: PROGRESSIVE_TEST_BRIEF,
      })

      expect(result).toEqual(err(structuredTransport))
      expect(!result.ok && packagedE2eFailureDiagnostic(result.error))
        .toBe('provider-transport')
      expect(generateText).toHaveBeenCalledTimes(1)
      expect(generateObject).toHaveBeenCalledTimes(1)
    },
  )

  it('reports bounded progressive page progress and preserves the failed stage', async () => {
    const plan = createBenchmarkPlan()
    const onProgress = vi.fn()
    const generateObject = mockGenerateSequence(
      ok(progressiveDesignFoundationFor(plan)),
      ok(progressiveDesignExplorationFor(plan)),
      ok(plan.pages[0]!),
      err('Structured JSON generation failed: response did not match schema'),
      ...plan.pages.slice(2).map((page) => ok(page)),
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
      stage: 'page', completedPages: 5, totalPages: 6,
    })
  })

  it('repairs only the progressive page whose route identity changed', async () => {
    const plan = createBenchmarkPlan()
    const expected = progressivePlanFor(plan)
    const changedPages = plan.pages.map((page, index) => index === 2
      ? { ...page, purpose: 'A changed purpose.' }
      : page)
    const generateObject = mockGenerateSequence(
      ok(progressiveDesignFoundationFor(plan)),
      ok(progressiveDesignExplorationFor(plan)),
      ...changedPages.map((page) => ok(page)),
      ok(plan.pages[2]!),
    )
    const result = await planPrototype(fakeGeneration(
      generateObject,
      mockGenerateText(ok(progressiveOutlineProtocolFor(plan))),
    ), {
      providerId: 'p',
      model: 'm',
      brief: PROGRESSIVE_TEST_BRIEF,
    })

    expect(result).toEqual(ok(expected))
    expect(generateObject).toHaveBeenCalledTimes(9)
    const repairInput = generateObject.mock.calls[8]![0]
    expect(repairInput.system).toContain('page integrity repairer')
    expect(repairInput.input?.[0]).toEqual(expect.objectContaining({
      type: 'text',
      text: expect.stringContaining('"pageId":"page-3"'),
    }))
  })

  it('repairs one page-local reference without changing authored counts', async () => {
    const plan = createBenchmarkPlan()
    const expected = progressivePlanFor(plan)
    const invalidPage = {
      ...plan.pages[3]!,
      interactions: plan.pages[3]!.interactions.map((interaction) => ({
        ...interaction,
        sourceSectionId: 'missing-region',
      })),
    }
    const generateObject = mockGenerateSequence(
      ok(progressiveDesignFoundationFor(plan)),
      ok(progressiveDesignExplorationFor(plan)),
      ...plan.pages.map((page, index) => ok(index === 3 ? invalidPage : page)),
      ok(plan.pages[3]!),
    )

    const result = await planPrototype(fakeGeneration(
      generateObject,
      mockGenerateText(ok(progressiveOutlineProtocolFor(plan))),
    ), {
      providerId: 'p',
      model: 'm',
      brief: PROGRESSIVE_TEST_BRIEF,
    })

    expect(result).toEqual(ok(expected))
    expect(generateObject).toHaveBeenCalledTimes(9)
    expect(generateObject.mock.calls[8]![0].input?.[0]).toEqual(
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('"code":"unknown-source-section"'),
      }),
    )
    expect(result.ok && result.data.pages[3]!.regions).toHaveLength(
      invalidPage.regions.length,
    )
    expect(result.ok && result.data.pages[3]!.interactions).toHaveLength(
      invalidPage.interactions.length,
    )
    expect(result.ok && prototypePageAssetCount(result.data.pages[3]!)).toBe(
      prototypePageAssetCount(invalidPage),
    )
  })

  it('fails closed after the single page repair remains invalid', async () => {
    const plan = createBenchmarkPlan()
    const changedViewport = plan.pages.map((page, index) => index === 1
      ? { ...page, viewport: { ...page.viewport, width: 1280 } }
      : page)
    const viewportGeneration = mockGenerateSequence(
      ok(progressiveDesignFoundationFor(plan)),
      ok(progressiveDesignExplorationFor(plan)),
      ...changedViewport.map((page) => ok(page)),
      ok(changedViewport[1]!),
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
      'page repair remained invalid',
    )
    expect(viewportGeneration).toHaveBeenCalledTimes(9)
  })

  it('compiles closure directly from the authoritative outline without another Provider call', async () => {
    const plan = createBenchmarkPlan()
    const expected = progressivePlanFor(plan)
    const generateObject = mockGenerateSequence(
      ok(progressiveDesignFoundationFor(plan)),
      ok(progressiveDesignExplorationFor(plan)),
      ...plan.pages.map((page) => ok(page)),
    )
    const result = await planPrototype(fakeGeneration(
      generateObject,
      mockGenerateText(ok(progressiveOutlineProtocolFor(plan))),
    ), {
      providerId: 'p',
      model: 'm',
      brief: PROGRESSIVE_TEST_BRIEF,
    })

    expect(result).toEqual(ok(expected))
    expect(generateObject).toHaveBeenCalledTimes(2 + plan.pages.length)
    expect(result.ok && result.data.flows).toEqual(expected.flows)
    expect(result.ok && result.data.reviewDocument).toEqual(expected.reviewDocument)
    const pageExpansionSystems = generateObject.mock.calls
      .slice(2, 2 + plan.pages.length)
      .map(([input]) => input.system)
    expect(pageExpansionSystems.every((system) =>
      system?.includes('prototype page architect'))).toBe(true)
    expect(generateObject.mock.calls.slice(2 + plan.pages.length)).toHaveLength(0)
  })

  it('fails closed without a second page repair when two page details are invalid', async () => {
    const plan = createBenchmarkPlan()
    const invalidPages = plan.pages.map((page, index) => index < 2
      ? { ...page, purpose: `Invalid purpose ${index + 1}.` }
      : page)
    const generateObject = mockGenerateSequence(
      ok(progressiveDesignFoundationFor(plan)),
      ok(progressiveDesignExplorationFor(plan)),
      ...invalidPages.map((page) => ok(page)),
      ok(plan.pages[0]!),
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
    expect(!result.ok && result.error).toContain('changed route identity for page-2')
    expect(generateObject).toHaveBeenCalledTimes(9)
  })

  it.each([
    'API_KEY_REQUIRED',
    'policy approval denied',
    'AbortError: operation aborted',
    'Prototype planner page 2 timed out.',
    'request failed: network unavailable',
  ])('does not repair a page-stage execution failure: %s', async (failure) => {
    const plan = createBenchmarkPlan()
    const generateObject = mockGenerateSequence(
      ok(progressiveDesignFoundationFor(plan)),
      ok(progressiveDesignExplorationFor(plan)),
      ok(plan.pages[0]!),
      err(failure),
      ...plan.pages.slice(2).map((page) => ok(page)),
    )

    const result = await planPrototype(fakeGeneration(
      generateObject,
      mockGenerateText(ok(progressiveOutlineProtocolFor(plan))),
    ), {
      providerId: 'p',
      model: 'm',
      brief: PROGRESSIVE_TEST_BRIEF,
    })

    expect(result).toEqual(err(failure))
    expect(generateObject).toHaveBeenCalledTimes(8)
    expect(generateObject.mock.calls.some(([input]) =>
      input.system?.includes('page integrity repairer'))).toBe(false)
    expect(generateObject.mock.calls.some(([input]) =>
      input.system?.includes('journey closure repairer'))).toBe(false)
  })

  it('fails closed when a progressive stage reports a credential error', async () => {
    const plan = createBenchmarkPlan()
    const generateObject = mockGenerateSequence(
      err('API_KEY_REQUIRED'),
    )
    const result = await planPrototype(fakeGeneration(
      generateObject,
      mockGenerateText(ok(progressiveOutlineProtocolFor(plan))),
    ), {
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
    expect(plan.designSystem.exploration.bounds.maxParallelism)
      .toBe(PROTOTYPE_DESIGN_SYSTEM_MAX_PARALLELISM)
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
      brief: 'Build one page.',
    })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('invalid prototype plan')
    expect(!result.ok && result.error).toContain('unreachable pages')
  })
})
