import { describe, it, expect, vi } from 'vitest'
import { planFromBrief } from './run-plan'
import { ok, err, isErr, type Result } from '@/services/types'
import type { GenerateInput, GenerationService } from '@/services/ai/types'

/** The structured-output shape each generateObject call resolves. */
type GenResult = Result<unknown>

/** A typed stand-in for `generateObject` so `.mock.calls` keeps its arg types. */
type GenObjectFn = (input: GenerateInput, schema: unknown) => Promise<GenResult>

/** A GenerationService whose only exercised method is `generateObject`. */
function fakeGeneration(generateObject: unknown): GenerationService {
  return {
    generateText: vi.fn(),
    streamText: vi.fn(),
    generateImages: vi.fn(),
    editImage: vi.fn(),
    generateObject,
  } as unknown as GenerationService
}

/** A confident, self-derived profile with no clarifying questions. */
const confidentProfile = {
  goal: 'A mobile marketplace for cartoon figurine collectibles',
  strategy: 'catalog-first collectibles storefront',
  rationale: 'The brief centers on browsing + buying stylized figures.',
  dimensions: [{ aspect: 'domain', value: 'e-commerce / collectibles' }],
  assumptions: ['Consumer-facing, not a wholesale portal'],
  confidence: 0.86,
  questions: [],
}

/** A minimal, structurally valid graph the planner call resolves. */
const sampleGraph = {
  nodes: [
    { id: 'ds', op: 'generate-image', label: '设计系统', prompt: 'style', inputs: [] },
    {
      id: 'screen',
      op: 'edit-image',
      label: '原型图',
      prompt: 'catalog screen',
      inputs: ['ds'],
      fidelity: 'high',
    },
  ],
  edges: [{ from: 'ds', to: 'screen' }],
}

describe('planFromBrief', () => {
  it('recognizes then plans a graph when confidence is high and no questions', async () => {
    // First generateObject → intent; second → graph.
    const generateObject = vi
      .fn<GenObjectFn>()
      .mockResolvedValueOnce(ok(confidentProfile))
      .mockResolvedValueOnce(ok(sampleGraph))
    const gen = fakeGeneration(generateObject)

    const result = await planFromBrief(gen, {
      providerId: 'chat',
      model: 'gpt-5.5',
      brief: '卡通手办商城',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.kind).toBe('planned')
    if (result.data.kind !== 'planned') return
    expect(result.data.intent.strategy).toBe('catalog-first collectibles storefront')
    expect(result.data.graph.nodes.map((n) => n.id)).toContain('ds')

    // Both slots exercised: intent recognition, then planning.
    expect(generateObject).toHaveBeenCalledTimes(2)
    expect(generateObject.mock.calls[0][0].promptRef).toEqual({ id: 'ui-intent-recognition' })
    expect(generateObject.mock.calls[1][0].promptRef).toEqual({ id: 'ui-graph-planner' })
  })

  it('surfaces questions and does NOT plan on a low-confidence profile', async () => {
    const uncertain = {
      goal: 'Something involving figurines — scope unclear',
      strategy: 'clarify-before-committing',
      rationale: 'Too terse to infer surfaces or audience.',
      dimensions: [{ aspect: 'domain', value: 'possibly collectibles' }],
      assumptions: [],
      confidence: 0.3,
      questions: ['Is this a storefront, a showcase, or a fan community?'],
    }
    const generateObject = vi.fn<GenObjectFn>().mockResolvedValueOnce(ok(uncertain))
    const gen = fakeGeneration(generateObject)

    const result = await planFromBrief(gen, { providerId: 'p', model: 'm', brief: '手办' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.kind).toBe('clarify')
    if (result.data.kind !== 'clarify') return
    expect(result.data.intent.questions).toHaveLength(1)

    // The planner was never called — recognition was the only model call.
    expect(generateObject).toHaveBeenCalledTimes(1)
  })

  it('propagates a recognition failure without planning', async () => {
    const generateObject = vi.fn<GenObjectFn>().mockResolvedValueOnce(err('recognize boom'))
    const gen = fakeGeneration(generateObject)
    const result = await planFromBrief(gen, { providerId: 'p', model: 'm', brief: 'x' })
    expect(result).toEqual(err('recognize boom'))
    expect(generateObject).toHaveBeenCalledTimes(1)
  })

  it('propagates a planning failure after a confident intent', async () => {
    const cyclic = {
      nodes: [
        { id: 'a', op: 'generate-image', label: 'a', inputs: ['b'] },
        { id: 'b', op: 'edit-image', label: 'b', inputs: ['a'] },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    }
    const generateObject = vi
      .fn<GenObjectFn>()
      .mockResolvedValueOnce(ok(confidentProfile))
      .mockResolvedValueOnce(ok(cyclic))
    const gen = fakeGeneration(generateObject)
    const result = await planFromBrief(gen, { providerId: 'p', model: 'm', brief: 'x' })
    expect(result.ok).toBe(false)
    if (!isErr(result)) return
    expect(result.error).toContain('invalid graph')
  })
})
