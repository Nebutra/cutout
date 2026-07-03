import { describe, it, expect, vi } from 'vitest'
import {
  runGraph,
  reRunSubtree,
  subtreeIds,
  type NodeRunState,
  type RunDeps,
} from './executor'
import type { GraphNodeSpec, GraphSpec } from './graph-spec'

/** Build a node whose declared `inputs` mirror the edges feeding it. */
function node(id: string, inputs: string[] = []): GraphNodeSpec {
  return { id, op: 'generate-image', label: id, inputs }
}

/** Derive the edge list from every node's `inputs` (kept consistent). */
function graphFrom(nodes: GraphNodeSpec[]): GraphSpec {
  const edges = nodes.flatMap((n) => n.inputs.map((from) => ({ from, to: n.id })))
  return { nodes, edges }
}

/** A resolved-promise microtask yield. */
const tick = (): Promise<void> => Promise.resolve()

/** All-`done` prior states (each node's output is its own id), for re-run tests. */
function priorAllDone(spec: GraphSpec): Map<string, NodeRunState<string>> {
  return new Map(
    spec.nodes.map((n) => [n.id, { status: 'done', output: n.id } as const]),
  )
}

describe('executor.runGraph', () => {
  it('respects topological order (upstream completes before downstream starts)', async () => {
    // ds → a → b, and ds → c (a fan-out with a chain).
    const spec = graphFrom([node('ds'), node('a', ['ds']), node('b', ['a']), node('c', ['ds'])])
    const started: string[] = []

    const deps: RunDeps<string> = {
      runNode: async (n, inputs) => {
        started.push(n.id)
        // Every declared input must already be present as an upstream output.
        for (const input of n.inputs) expect(inputs.has(input)).toBe(true)
        await tick()
        return n.id
      },
    }

    const result = await runGraph(spec, deps)

    const rank = new Map(started.map((id, i) => [id, i]))
    expect(rank.get('ds')!).toBeLessThan(rank.get('a')!)
    expect(rank.get('a')!).toBeLessThan(rank.get('b')!)
    expect(rank.get('ds')!).toBeLessThan(rank.get('c')!)
    for (const n of spec.nodes) {
      expect(result.states.get(n.id)?.status).toBe('done')
    }
  })

  it('runs independent ready nodes concurrently (fan-out readiness)', async () => {
    // ds fans out to a + b; a and b are independent once ds is done.
    const spec = graphFrom([node('ds'), node('a', ['ds']), node('b', ['ds'])])

    let active = 0
    let peak = 0
    // Barrier so a + b must BOTH enter before either is allowed to finish.
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let entered = 0

    const deps: RunDeps<string> = {
      runNode: async (n) => {
        active += 1
        peak = Math.max(peak, active)
        if (n.id === 'a' || n.id === 'b') {
          entered += 1
          if (entered === 2) release()
          await gate
        }
        active -= 1
        return n.id
      },
    }

    await runGraph(spec, deps)
    expect(peak).toBe(2) // a and b overlapped
  })

  it('honours the bounded concurrency cap', async () => {
    // Four independent roots, pool of 2 → never more than 2 in flight.
    const spec = graphFrom([node('a'), node('b'), node('c'), node('d')])

    let active = 0
    let peak = 0
    const deps: RunDeps<string> = {
      concurrency: 2,
      runNode: async (n) => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 5))
        active -= 1
        return n.id
      },
    }

    await runGraph(spec, deps)
    expect(peak).toBe(2)
  })

  it('localizes a failure: only descendants are blocked, siblings still run', async () => {
    // ds → a → x  and  ds → b → y. `a` fails → x blocked; b + y still complete.
    const spec = graphFrom([
      node('ds'),
      node('a', ['ds']),
      node('x', ['a']),
      node('b', ['ds']),
      node('y', ['b']),
    ])
    const ran = new Set<string>()

    const deps: RunDeps<string> = {
      runNode: async (n) => {
        ran.add(n.id)
        if (n.id === 'a') throw new Error('a exploded')
        return n.id
      },
    }

    const result = await runGraph(spec, deps)

    expect(result.states.get('a')?.status).toBe('error')
    expect(result.states.get('a')?.error).toContain('exploded')
    expect(result.states.get('x')?.status).toBe('blocked')
    expect(result.states.get('b')?.status).toBe('done')
    expect(result.states.get('y')?.status).toBe('done')
    expect(ran.has('x')).toBe(false) // blocked node never dispatched
  })
})

describe('executor.reRunSubtree', () => {
  it('re-runs exactly the node and its descendants', async () => {
    // ds → a → b, ds → c. Re-run from `a` → a + b only (ds, c untouched).
    const spec = graphFrom([node('ds'), node('a', ['ds']), node('b', ['a']), node('c', ['ds'])])
    const runNode = vi.fn(async (n: GraphNodeSpec) => n.id)

    const result = await reRunSubtree(spec, 'a', { runNode }, priorAllDone(spec))

    const ran = runNode.mock.calls.map(([n]) => n.id).sort()
    expect(ran).toEqual(['a', 'b'])
    // ds and c keep their prior done outputs; a and b are freshly done.
    for (const id of ['ds', 'a', 'b', 'c']) {
      expect(result.states.get(id)?.status).toBe('done')
    }
  })

  it('subtreeIds returns the node plus every transitive descendant', () => {
    const spec = graphFrom([node('ds'), node('a', ['ds']), node('b', ['a']), node('c', ['ds'])])
    expect([...subtreeIds(spec, 'a')].sort()).toEqual(['a', 'b'])
    expect([...subtreeIds(spec, 'ds')].sort()).toEqual(['a', 'b', 'c', 'ds'])
  })
})
