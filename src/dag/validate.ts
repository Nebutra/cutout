/**
 * GraphSpec validation (spec §3/§B) — reject a bad AI-emitted graph BEFORE the
 * Executor touches it. The Planner is re-promptable, so every failure returns a
 * clear, human-readable reason via the shared `Result` envelope.
 *
 * Checks (all must hold): non-empty; unique node ids, edges, and inputs; every
 * edge endpoint refers to an existing node; every node's `inputs` exactly match
 * its incoming edges; and the graph
 * is ACYCLIC. Acyclicity is proven constructively via Kahn's topological sort —
 * on success we hand back the topological ORDER (node ids), which the Executor
 * consumes directly to schedule ready nodes.
 *
 * Pure and side-effect free: it reads a `GraphSpec` and returns a `Result`; it
 * never throws across the seam and never mutates its input.
 */
import type { Result } from '@/services/types'
import { err, ok } from '@/services/types'
import type { GraphSpec, NodeOp } from './graph-spec'

/** A validated graph plus the topological order the Executor schedules on. */
export interface ValidatedGraph {
  /** Node ids in a valid execution order (upstream before downstream). */
  readonly order: readonly string[]
}

interface InputArity {
  readonly min: number
  readonly max: number
}

function inputArity(op: NodeOp): InputArity {
  switch (op) {
    case 'generate-image':
      return { min: 0, max: 0 }
    case 'edit-image':
      return { min: 1, max: Number.POSITIVE_INFINITY }
    case 'deconstruct':
    case 'cutout':
    case 'name':
      return { min: 1, max: 1 }
  }
}

function describeArity({ min, max }: InputArity): string {
  if (min === max) return `exactly ${min}`
  if (!Number.isFinite(max)) return `at least ${min}`
  return `between ${min} and ${max}`
}

/**
 * Validate an AI-emitted {@link GraphSpec}. On success returns the topological
 * order of node ids; on failure returns the first structural problem found.
 */
export function validateGraph(spec: GraphSpec): Result<ValidatedGraph> {
  const { nodes, edges } = spec

  if (nodes.length === 0) return err('Graph has no nodes.')

  // Unique ids.
  const ids = new Set<string>()
  for (const node of nodes) {
    if (ids.has(node.id)) return err(`Duplicate node id: "${node.id}".`)
    ids.add(node.id)
  }

  // Every edge endpoint must reference an existing node.
  for (const edge of edges) {
    if (!ids.has(edge.from)) {
      return err(`Edge references unknown source node: "${edge.from}".`)
    }
    if (!ids.has(edge.to)) {
      return err(`Edge references unknown target node: "${edge.to}".`)
    }
  }

  // Build the incoming-edge set per node (sources feeding into each target).
  // Duplicate edges have no useful runtime meaning and make a model-produced
  // graph ambiguous, so reject them before collapsing to a Set.
  const incoming = new Map<string, Set<string>>(
    nodes.map((n) => [n.id, new Set<string>()]),
  )
  for (const edge of edges) {
    const sources = incoming.get(edge.to) as Set<string>
    if (sources.has(edge.from)) {
      return err(`Duplicate edge: "${edge.from}" → "${edge.to}".`)
    }
    sources.add(edge.from)
  }

  // Edges are the execution/data-dependency contract, not display-only lines.
  // Require exact equality so the executor cannot silently ignore an incoming
  // edge and start its target before that source has completed.
  for (const node of nodes) {
    const sources = incoming.get(node.id) ?? new Set<string>()
    const arity = inputArity(node.op)
    if (node.inputs.length < arity.min || node.inputs.length > arity.max) {
      return err(
        `Node "${node.id}" (${node.op}) must declare ${describeArity(arity)} input${arity.max === 1 ? '' : 's'}, received ${node.inputs.length}.`,
      )
    }
    const inputs = new Set<string>()
    for (const input of node.inputs) {
      if (inputs.has(input)) {
        return err(`Node "${node.id}" lists duplicate input: "${input}".`)
      }
      inputs.add(input)
      if (!ids.has(input)) {
        return err(
          `Node "${node.id}" lists unknown input: "${input}".`,
        )
      }
      if (!sources.has(input)) {
        return err(
          `Node "${node.id}" input "${input}" has no matching edge.`,
        )
      }
    }
    for (const source of sources) {
      if (!inputs.has(source)) {
        return err(
          `Node "${node.id}" has incoming edge from "${source}" but does not declare it as an input.`,
        )
      }
    }
  }

  // Kahn's algorithm — proves acyclicity and yields a topological order.
  const order = topologicalOrder(
    nodes.map((n) => n.id),
    edges,
  )
  if (order === null) return err('Graph contains a cycle.')

  return ok({ order })
}

/**
 * Kahn's topological sort. Returns the ordered node ids, or `null` when a cycle
 * prevents a complete ordering. Node ids and edges are assumed already validated
 * to reference real nodes. Deterministic: ties break by the input node order.
 */
function topologicalOrder(
  nodeIds: readonly string[],
  edges: GraphSpec['edges'],
): string[] | null {
  const indegree = new Map<string, number>(nodeIds.map((id) => [id, 0]))
  const outgoing = new Map<string, string[]>(nodeIds.map((id) => [id, []]))
  for (const edge of edges) {
    outgoing.get(edge.from)?.push(edge.to)
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1)
  }

  // Seed the queue with roots, preserving the declared node order.
  const queue = nodeIds.filter((id) => (indegree.get(id) ?? 0) === 0)
  const order: string[] = []
  while (queue.length > 0) {
    const id = queue.shift() as string
    order.push(id)
    for (const next of outgoing.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1
      indegree.set(next, remaining)
      if (remaining === 0) queue.push(next)
    }
  }

  return order.length === nodeIds.length ? order : null
}
