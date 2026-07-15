import { describe, it, expect } from 'vitest'
import { isErr } from '@/services/types'
import { validateGraph } from './validate'
import {
  graphSpecSchema,
  type GraphNodeSpec,
  type GraphSpec,
} from './graph-spec'

/** A minimal node with sane defaults; override per case. */
function node(
  id: string,
  inputs: string[] = [],
  op: GraphNodeSpec['op'] = 'generate-image',
): GraphNodeSpec {
  return { id, op, label: id, inputs }
}

describe('validateGraph', () => {
  it('topologically orders a valid fan-out graph (upstream before downstream)', () => {
    // ds → (a, b); a → cut. A design-system node fanning out to two mockups.
    const spec: GraphSpec = {
      nodes: [
        node('ds', [], 'generate-image'),
        node('a', ['ds'], 'edit-image'),
        node('b', ['ds'], 'edit-image'),
        node('cut', ['a'], 'cutout'),
      ],
      edges: [
        { from: 'ds', to: 'a' },
        { from: 'ds', to: 'b' },
        { from: 'a', to: 'cut' },
      ],
    }
    const result = validateGraph(spec)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const order = result.data.order
    expect([...order].sort()).toEqual(['a', 'b', 'cut', 'ds'])
    // Every edge respects the order: source precedes target.
    const rank = new Map(order.map((id, i) => [id, i]))
    for (const e of spec.edges) {
      expect(rank.get(e.from)!).toBeLessThan(rank.get(e.to)!)
    }
  })

  it('rejects an empty graph', () => {
    const result = validateGraph({ nodes: [], edges: [] })
    expect(result.ok).toBe(false)
    if (!isErr(result)) return
    expect(result.error).toContain('no nodes')
  })

  it('rejects duplicate node ids', () => {
    const spec: GraphSpec = {
      nodes: [node('x'), node('x')],
      edges: [],
    }
    const result = validateGraph(spec)
    expect(result.ok).toBe(false)
    if (!isErr(result)) return
    expect(result.error).toContain('Duplicate node id')
  })

  it('rejects an edge referencing a missing node (dangling edge)', () => {
    const spec: GraphSpec = {
      nodes: [node('a')],
      edges: [{ from: 'a', to: 'ghost' }],
    }
    const result = validateGraph(spec)
    expect(result.ok).toBe(false)
    if (!isErr(result)) return
    expect(result.error).toContain('ghost')
  })

  it('rejects an input that has no backing edge (inputs ⊄ edges)', () => {
    // b declares an input on a, but no a→b edge exists.
    const spec: GraphSpec = {
      nodes: [node('a'), node('b', ['a'], 'edit-image')],
      edges: [],
    }
    const result = validateGraph(spec)
    expect(result.ok).toBe(false)
    if (!isErr(result)) return
    expect(result.error).toContain('no matching edge')
  })

  it('rejects an edge that is not declared as a data input', () => {
    // Edges are scheduling/data dependencies, not merely presentation lines.
    // Accepting this would let the executor run b before a is complete.
    const spec: GraphSpec = {
      nodes: [node('a'), node('b')],
      edges: [{ from: 'a', to: 'b' }],
    }
    const result = validateGraph(spec)
    expect(result.ok).toBe(false)
    if (!isErr(result)) return
    expect(result.error).toContain('does not declare')
  })

  it('rejects duplicate data dependencies and duplicate edges', () => {
    const duplicateInput: GraphSpec = {
      nodes: [node('a'), node('b', ['a', 'a'], 'edit-image')],
      edges: [{ from: 'a', to: 'b' }],
    }
    const duplicateEdge: GraphSpec = {
      nodes: [node('a'), node('b', ['a'], 'edit-image')],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'b' },
      ],
    }

    expect(validateGraph(duplicateInput).ok).toBe(false)
    expect(validateGraph(duplicateEdge).ok).toBe(false)
  })

  it('rejects an input referencing an unknown node', () => {
    const spec: GraphSpec = {
      nodes: [node('a', ['nope'], 'edit-image')],
      edges: [],
    }
    const result = validateGraph(spec)
    expect(result.ok).toBe(false)
    if (!isErr(result)) return
    expect(result.error).toContain('unknown input')
  })

  it('rejects a cycle (topological sort cannot complete)', () => {
    // a → b → a is a 2-cycle; inputs mirror the edges so only acyclicity fails.
    const spec: GraphSpec = {
      nodes: [node('a', ['b'], 'edit-image'), node('b', ['a'], 'edit-image')],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
    }
    const result = validateGraph(spec)
    expect(result.ok).toBe(false)
    if (!isErr(result)) return
    expect(result.error).toContain('cycle')
  })

  it('accepts a single isolated node', () => {
    const result = validateGraph({ nodes: [node('solo')], edges: [] })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.order).toEqual(['solo'])
  })

  it('rejects the bootstrap-only plan op from executable graph schemas', () => {
    const result = graphSpecSchema.safeParse({
      nodes: [{ id: 'plan', op: 'plan', label: 'Plan', inputs: [] }],
      edges: [],
    })
    expect(result.success).toBe(false)
  })

  it.each([
    ['generate-image', ['upstream']],
    ['edit-image', []],
    ['deconstruct', []],
    ['cutout', []],
    ['name', []],
  ] as const)(
    'rejects an invalid input arity for %s',
    (op, inputs) => {
      const upstreamNodes = inputs.map((id) => node(id))
      const spec: GraphSpec = {
        nodes: [...upstreamNodes, node('target', [...inputs], op)],
        edges: inputs.map((from) => ({ from, to: 'target' })),
      }
      const result = validateGraph(spec)
      expect(result.ok).toBe(false)
      if (!isErr(result)) return
      expect(result.error).toContain('must declare')
    },
  )

  it('accepts multiple reference images for edit-image', () => {
    const spec: GraphSpec = {
      nodes: [
        node('one'),
        node('two'),
        node('target', ['one', 'two'], 'edit-image'),
      ],
      edges: [
        { from: 'one', to: 'target' },
        { from: 'two', to: 'target' },
      ],
    }

    expect(validateGraph(spec).ok).toBe(true)
  })
})
