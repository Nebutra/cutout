import { describe, it, expect, vi } from 'vitest'
import { planGraph, composePlannerRequirement } from './planner'
import { graphSpecSchema } from './graph-spec'
import type { IntentProfile } from './intent-types'
import { ok, err, isErr, type Result } from '@/services/types'
import type { GenerateInput, GenerationService } from '@/services/ai/types'

/** The structured-output shape the planner call resolves. */
type PlanResult = Result<unknown>

/** A typed stand-in for `generateObject` so `.mock.calls` keeps its arg types. */
type GenObjectFn = (input: GenerateInput, schema: unknown) => Promise<PlanResult>

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

/** A canonical design-system → fan-out → deconstruct/cutout/name sample. */
const sampleGraph = {
  nodes: [
    { id: 'ds', op: 'generate-image', label: '设计系统', prompt: 'style', inputs: [] },
    {
      id: 'screen-cart',
      op: 'edit-image',
      label: '原型图·购物车',
      prompt: 'cart screen',
      inputs: ['ds'],
      fidelity: 'high',
    },
    { id: 'board-cart', op: 'deconstruct', label: '素材板·购物车', inputs: ['screen-cart'] },
    { id: 'cut-cart', op: 'cutout', label: '切片·购物车', inputs: ['board-cart'] },
    { id: 'name-cart', op: 'name', label: '命名·购物车', inputs: ['cut-cart'] },
  ],
  edges: [
    { from: 'ds', to: 'screen-cart' },
    { from: 'screen-cart', to: 'board-cart' },
    { from: 'board-cart', to: 'cut-cart' },
    { from: 'cut-cart', to: 'name-cart' },
  ],
}

describe('planGraph', () => {
  it('rejects an empty brief without calling the model', async () => {
    const generateObject = vi.fn<GenObjectFn>()
    const gen = fakeGeneration(generateObject)
    const result = await planGraph(gen, { providerId: 'p', model: 'm', brief: '  ' })
    expect(result.ok).toBe(false)
    expect(generateObject).not.toHaveBeenCalled()
  })

  it('plans a valid graph on the chat slot and returns it', async () => {
    const generateObject = vi.fn<GenObjectFn>().mockResolvedValue(ok(sampleGraph))
    const gen = fakeGeneration(generateObject)
    const result = await planGraph(gen, {
      providerId: 'chat',
      model: 'gpt-5.5',
      brief: 'A shopping app',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.nodes.map((n) => n.id)).toContain('ds')

    // The call carries the planner promptRef + the brief as a text part.
    const [input, schema] = generateObject.mock.calls[0]
    expect(input.promptRef).toEqual({ id: 'ui-graph-planner' })
    expect(input.model).toBe('gpt-5.5')
    expect(input.input?.[0]).toEqual({ type: 'text', text: 'A shopping app' })
    expect(schema).toBe(graphSpecSchema)
  })

  it('composes the requirement from an intent and sends it as the text part', async () => {
    const intent: IntentProfile = {
      goal: 'A mobile marketplace for cartoon figurines',
      strategy: 'catalog-first collectibles storefront',
      rationale: 'The brief centers on browsing + buying stylized figures.',
      dimensions: [{ aspect: 'audience', value: 'figure hobbyists' }],
      assumptions: ['Consumer-facing, not wholesale'],
      confidence: 0.86,
      questions: [],
    }
    const generateObject = vi.fn<GenObjectFn>().mockResolvedValue(ok(sampleGraph))
    const gen = fakeGeneration(generateObject)
    const result = await planGraph(gen, {
      providerId: 'chat',
      model: 'gpt-5.5',
      brief: '卡通手办商城',
      intent,
    })
    expect(result.ok).toBe(true)

    const [input] = generateObject.mock.calls[0]
    const text = (input.input?.[0] as { type: 'text'; text: string }).text
    // The composed requirement carries the reconstructed goal + self-derived
    // strategy + the mined dimension, plus the original brief for context.
    expect(text).toContain('catalog-first collectibles storefront')
    expect(text).toContain('A mobile marketplace for cartoon figurines')
    expect(text).toContain('figure hobbyists')
    expect(text).toContain('卡通手办商城')
  })

  it('composePlannerRequirement returns the raw brief when no intent is given', () => {
    expect(composePlannerRequirement('just a brief')).toBe('just a brief')
  })

  it('propagates a generation failure', async () => {
    const generateObject = vi.fn<GenObjectFn>().mockResolvedValue(err('boom'))
    const gen = fakeGeneration(generateObject)
    const result = await planGraph(gen, { providerId: 'p', model: 'm', brief: 'x' })
    expect(result).toEqual(err('boom'))
  })

  it('rejects a structurally invalid (cyclic) graph from the model', async () => {
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
    const generateObject = vi.fn<GenObjectFn>().mockResolvedValue(ok(cyclic))
    const gen = fakeGeneration(generateObject)
    const result = await planGraph(gen, { providerId: 'p', model: 'm', brief: 'x' })
    expect(result.ok).toBe(false)
    if (!isErr(result)) return
    expect(result.error).toContain('invalid graph')
    expect(result.error).toContain('cycle')
  })
})
