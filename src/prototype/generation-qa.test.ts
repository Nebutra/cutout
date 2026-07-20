import { describe, expect, it } from 'vitest'
import {
  buildBoardChecklist,
  buildPageChecklist,
  generateWithQa,
  qaRetryPrompt,
  reviewGeneratedImage,
  type QaVerdict,
} from './generation-qa'
import type { PrototypePage, PrototypePlan, PrototypeRegion } from './prototype-plan'
import { err, ok } from '@/services/types'
import type { GenerationService } from '@/services/ai/types'

const region: PrototypeRegion = {
  id: 'r1',
  name: 'Task List',
  role: 'content',
  complexity: 'medium',
  summary: 'Daily tasks with rewards',
  assetRoute: 'board-cutout',
  assetOpportunities: ['reward icon', 'task card'],
} as PrototypeRegion

const page = {
  id: 'p1',
  name: 'Home',
  route: '/',
  purpose: 'Overview',
  viewport: { platform: 'mobile', width: 390, height: 844, scroll: 'vertical' },
  regions: [region],
  interactions: [],
} as unknown as PrototypePage

const plan = {
  product: { name: 'App' },
  designSystem: {
    styleSummary: 'warm hand-drawn casual',
    palette: ['#FFF8F2', '#C96A3D'],
  },
  pages: [page],
  flows: [],
} as unknown as PrototypePlan

describe('checklists', () => {
  it('page checklist covers every region plus the global rules', () => {
    const rules = buildPageChecklist(plan, page)
    expect(rules.some((rule) => rule.includes('"Task List"'))).toBe(true)
    expect(rules.some((rule) => rule.includes('pseudo text'))).toBe(true)
    expect(rules.some((rule) => rule.includes('device bezel'))).toBe(true)
    expect(rules).toHaveLength(page.regions.length + 4)
  })

  it('board checklist scopes to the region and bans baked text', () => {
    const rules = buildBoardChecklist(page, region)
    expect(rules[0]).toContain('Task List')
    expect(rules[0]).toContain('reward icon')
    expect(rules.some((rule) => rule.includes('No text is baked'))).toBe(true)
  })
})

describe('qaRetryPrompt', () => {
  it('returns the base prompt untouched when there are no failures', () => {
    expect(qaRetryPrompt('base', [])).toBe('base')
  })

  it('appends numbered corrections', () => {
    const prompt = qaRetryPrompt('base', ['fix a', 'fix b'])
    expect(prompt).toContain('base')
    expect(prompt).toContain('REJECTED')
    expect(prompt).toContain('1. fix a')
    expect(prompt).toContain('2. fix b')
  })
})

describe('reviewGeneratedImage', () => {
  const slot = { providerId: 'prov', model: 'vision-model' }
  const bytes = new Uint8Array([1])

  it('maps a structured verdict through and treats failures as rejection', async () => {
    const generation = {
      generateObject: async () => ok({ pass: true, failures: ['leftover'] }),
    } as unknown as Pick<GenerationService, 'generateObject'>
    const verdict = await reviewGeneratedImage(generation, slot, bytes, ['rule'])
    expect(verdict.pass).toBe(false)
    expect(verdict.failures).toEqual(['leftover'])
  })

  it('fails closed when the review call itself fails', async () => {
    let reported = ''
    const generation = { generateObject: async () => err('boom') } as unknown as Pick<
      GenerationService,
      'generateObject'
    >
    const verdict = await reviewGeneratedImage(
      generation,
      slot,
      bytes,
      ['rule'],
      undefined,
      (message) => {
        reported = message
      },
    )
    expect(verdict).toEqual({
      pass: false,
      failures: ['Visual QA unavailable: boom'],
      unavailable: true,
    })
    expect(reported).toBe('boom')
  })
})

describe('generateWithQa', () => {
  const pass: QaVerdict = { pass: true, failures: [] }
  const fail: QaVerdict = { pass: false, failures: ['garbled text'] }

  it('returns the first passing attempt without retrying', async () => {
    let generations = 0
    const result = await generateWithQa({
      basePrompt: 'base',
      generate: async () => {
        generations += 1
        return new Uint8Array([generations])
      },
      review: async () => pass,
      maxRetries: 2,
    })
    expect(result.attempts).toBe(1)
    expect(generations).toBe(1)
    expect(result.verdict.pass).toBe(true)
  })

  it('feeds failures into the retry prompt and stops on pass', async () => {
    const prompts: string[] = []
    const verdicts: QaVerdict[] = [fail, pass]
    const result = await generateWithQa({
      basePrompt: 'base',
      generate: async (prompt) => {
        prompts.push(prompt)
        return new Uint8Array([prompts.length])
      },
      review: async () => verdicts.shift() ?? pass,
      maxRetries: 2,
    })
    expect(result.attempts).toBe(2)
    expect(prompts[0]).toBe('base')
    expect(prompts[1]).toContain('garbled text')
    expect(result.verdict.pass).toBe(true)
  })

  it('returns the last rejected attempt once the budget is spent', async () => {
    let generations = 0
    const seen: number[] = []
    const result = await generateWithQa({
      basePrompt: 'base',
      generate: async () => {
        generations += 1
        return new Uint8Array([generations])
      },
      review: async () => fail,
      maxRetries: 2,
      onVerdict: (attempt) => seen.push(attempt),
    })
    expect(result.attempts).toBe(3)
    expect(result.verdict.pass).toBe(false)
    expect(seen).toEqual([1, 2, 3])
  })

  it('honors maxRetries 0 as a single-attempt gate', async () => {
    const result = await generateWithQa({
      basePrompt: 'base',
      generate: async () => new Uint8Array([1]),
      review: async () => fail,
      maxRetries: 0,
    })
    expect(result.attempts).toBe(1)
    expect(result.verdict.pass).toBe(false)
  })

  it('does not spend regeneration attempts when the reviewer is unavailable', async () => {
    let generations = 0
    const result = await generateWithQa({
      basePrompt: 'base',
      generate: async () => new Uint8Array([++generations]),
      review: async () => ({
        pass: false,
        failures: ['Visual QA unavailable: timeout'],
        unavailable: true,
      }),
      maxRetries: 2,
    })
    expect(generations).toBe(1)
    expect(result.verdict.unavailable).toBe(true)
  })
})
