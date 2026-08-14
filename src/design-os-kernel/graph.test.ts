import { describe, expect, it, vi } from 'vitest'
import { outcomeGraphSchema, type OutcomeNode } from './contracts'
import {
  composeOutcomeFragments,
  deriveImpactSet,
  indexOutcomeDependencies,
  propagateImpact,
} from './graph'
import { fixtureOutcomeGraph } from './test-fixture'

function node(id: string, dependencies: OutcomeNode['dependencies'], state: OutcomeNode['state'] = 'satisfied'): OutcomeNode {
  return {
    id,
    revision: `${id}:1`,
    schema: { id: 'fixture.structured-outcome', version: 1 },
    recipe: { id: 'fixture.structured-recipe', version: 1 },
    payload: { id },
    dependencies,
    state,
    provenance: [],
  }
}

describe('Design OS fragment composition and impact indexes (K4, K9)', () => {
  it('uses explicit precedence and reports equal-precedence conflicts', () => {
    const base = fixtureOutcomeGraph()
    const composed = composeOutcomeFragments({
      graph: {
        protocol: base.protocol,
        kind: base.kind,
        schema: base.schema,
        identity: base.identity,
        provenance: base.provenance,
      },
      fragments: [
        {
          id: 'fragment:profile',
          source: { sourceId: 'profile:a', revision: 'profile:1', relation: 'profile-fragment' },
          precedence: 10,
          nodes: [node('outcome:a', [], 'proposed')],
        },
        {
          id: 'fragment:host',
          source: { sourceId: 'host:a', revision: 'host:1', relation: 'host-fragment' },
          precedence: 20,
          nodes: [node('outcome:a', [], 'planned')],
        },
      ],
    })
    expect(composed.graph.body.nodes[0]).toMatchObject({
      id: 'outcome:a',
      state: 'planned',
      provenance: [expect.objectContaining({ sourceId: 'host:a' })],
    })
    const conflict = composeOutcomeFragments({
      graph: { ...base, body: undefined } as never,
      fragments: [
        { id: 'fragment:a', source: { sourceId: 'a', revision: '1', relation: 'fragment' }, precedence: 1, nodes: [node('outcome:a', [], 'planned')] },
        { id: 'fragment:b', source: { sourceId: 'b', revision: '1', relation: 'fragment' }, precedence: 1, nodes: [node('outcome:a', [], 'blocked')] },
      ],
    })
    expect(conflict.conflicts).toEqual([expect.objectContaining({ nodeId: 'outcome:a', code: 'equal-precedence-conflict' })])
    expect(conflict.graph.body.nodes).toEqual([])
  })

  it('marks only the dependency-derived closure stale and starts no effects', () => {
    const execute = vi.fn()
    const graph = outcomeGraphSchema.parse({
      ...fixtureOutcomeGraph(),
      body: {
        nodes: [
          node('outcome:a', [{ kind: 'evidence', id: 'evidence:shared', revision: 'evidence:1' }]),
          node('outcome:b', [{ kind: 'outcome', id: 'outcome:a', revision: 'outcome:a:1' }]),
          node('outcome:c', [{ kind: 'evidence', id: 'evidence:other', revision: 'evidence:1' }]),
        ],
      },
    })
    const impact = deriveImpactSet(graph, [{ kind: 'evidence', id: 'evidence:shared', revision: 'evidence:2' }])
    const propagated = propagateImpact(graph, impact)

    expect(impact.affectedNodeIds).toEqual(['outcome:a', 'outcome:b'])
    expect(propagated.body.nodes.map(({ id, state }) => ({ id, state }))).toEqual([
      { id: 'outcome:a', state: 'stale' },
      { id: 'outcome:b', state: 'stale' },
      { id: 'outcome:c', state: 'satisfied' },
    ])
    expect(execute).not.toHaveBeenCalled()
    expect(() => deriveImpactSet(graph, [{
      kind: 'evidence', id: 'evidence:shared', revision: 'evidence:1',
    }])).toThrow(/does not describe a new revision/)
  })

  it('walks an indexed affected closure instead of scanning unrelated scale nodes', () => {
    const chainSize = 120
    const unrelatedSize = 4_000
    const nodes = [
      node('chain:0', [{ kind: 'policy', id: 'policy:shared', revision: 'policy:1' }]),
      ...Array.from({ length: chainSize - 1 }, (_, index) => node(`chain:${index + 1}`, [{
        kind: 'outcome', id: `chain:${index}`, revision: `chain:${index}:1`,
      }])),
      ...Array.from({ length: unrelatedSize }, (_, index) => node(`unrelated:${index}`, [{
        kind: 'evidence', id: `evidence:${index}`, revision: 'evidence:1',
      }])),
    ]
    const graph = outcomeGraphSchema.parse({ ...fixtureOutcomeGraph(), body: { nodes } })
    const index = indexOutcomeDependencies(graph)
    const impact = deriveImpactSet(graph, [{ kind: 'policy', id: 'policy:shared', revision: 'policy:2' }], index)

    expect(impact.affectedNodeIds).toHaveLength(chainSize)
    expect(impact.dependencyPaths[`chain:${chainSize - 1}`]).toHaveLength(chainSize + 1)
    expect(impact.affectedNodeIds).not.toContain('unrelated:0')
  })
})
