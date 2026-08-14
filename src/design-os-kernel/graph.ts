import { canonicalJson } from '@/design-ir/fingerprint'
import {
  outcomeGraphSchema,
  provenanceReferenceSchema,
  recordIdSchema,
  type DependencyReference,
  type OutcomeGraph,
  type OutcomeNode,
} from './contracts'
import { z } from 'zod'

export const graphFragmentSchema = z.object({
  id: recordIdSchema,
  source: provenanceReferenceSchema,
  precedence: z.number().int(),
  nodes: z.array(outcomeGraphSchema.shape.body.shape.nodes.element).max(20_000),
}).strict()
export type GraphFragment = z.infer<typeof graphFragmentSchema>

export interface CompositionConflict {
  readonly nodeId: string
  readonly fragmentIds: readonly string[]
  readonly precedence: number
  readonly code: 'equal-precedence-conflict'
}

export interface ComposedOutcomeGraph {
  readonly graph: OutcomeGraph
  readonly conflicts: readonly CompositionConflict[]
  readonly sourceFragmentByNodeId: Readonly<Record<string, string>>
}

export function composeOutcomeFragments(input: {
  readonly graph: Omit<OutcomeGraph, 'body'>
  readonly fragments: readonly GraphFragment[]
}): ComposedOutcomeGraph {
  const fragments = input.fragments.map((fragment) => graphFragmentSchema.parse(fragment))
  const candidates = new Map<string, Array<{ fragment: GraphFragment, node: OutcomeNode }>>()
  for (const fragment of fragments) {
    for (const node of fragment.nodes) {
      const entries = candidates.get(node.id) ?? []
      entries.push({ fragment, node })
      candidates.set(node.id, entries)
    }
  }
  const conflicts: CompositionConflict[] = []
  const sourceFragmentByNodeId: Record<string, string> = {}
  const nodes: OutcomeNode[] = []
  for (const [nodeId, entries] of [...candidates.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    entries.sort((left, right) => right.fragment.precedence - left.fragment.precedence
      || left.fragment.id.localeCompare(right.fragment.id))
    const selected = entries[0]!
    const peers = entries.filter((entry) => entry.fragment.precedence === selected.fragment.precedence)
    if (peers.some((entry) => canonicalJson(entry.node) !== canonicalJson(selected.node))) {
      conflicts.push({
        nodeId,
        fragmentIds: peers.map((entry) => entry.fragment.id),
        precedence: selected.fragment.precedence,
        code: 'equal-precedence-conflict',
      })
      continue
    }
    nodes.push({
      ...selected.node,
      provenance: [...selected.node.provenance, selected.fragment.source],
    })
    sourceFragmentByNodeId[nodeId] = selected.fragment.id
  }
  return {
    graph: outcomeGraphSchema.parse({ ...input.graph, body: { nodes } }),
    conflicts,
    sourceFragmentByNodeId,
  }
}

export interface DependencyIndex {
  readonly directDependentsByReference: ReadonlyMap<string, ReadonlySet<string>>
  readonly dependentOutcomeNodes: ReadonlyMap<string, ReadonlySet<string>>
}

export interface ImpactSet {
  readonly changedReferences: readonly DependencyReference[]
  readonly directlyAffectedNodeIds: readonly string[]
  readonly affectedNodeIds: readonly string[]
  readonly dependencyPaths: Readonly<Record<string, readonly string[]>>
}

export function dependencyKey(reference: Pick<DependencyReference, 'kind' | 'id'>): string {
  return `${reference.kind}:${reference.id}`
}

export function indexOutcomeDependencies(graph: OutcomeGraph): DependencyIndex {
  const parsed = outcomeGraphSchema.parse(graph)
  const direct = new Map<string, Set<string>>()
  const dependents = new Map<string, Set<string>>()
  for (const node of parsed.body.nodes) {
    for (const dependency of node.dependencies) {
      const key = dependencyKey(dependency)
      const targets = direct.get(key) ?? new Set()
      targets.add(node.id)
      direct.set(key, targets)
      if (dependency.kind === 'outcome') {
        const children = dependents.get(dependency.id) ?? new Set()
        children.add(node.id)
        dependents.set(dependency.id, children)
      }
    }
  }
  return { directDependentsByReference: direct, dependentOutcomeNodes: dependents }
}

export function deriveImpactSet(
  graph: OutcomeGraph,
  changedReferences: readonly DependencyReference[],
  index = indexOutcomeDependencies(graph),
): ImpactSet {
  const changed = changedReferences.map((reference) => reference)
  for (const reference of changed) {
    const matchingRevisions = graph.body.nodes.flatMap((node) => node.dependencies)
      .filter((dependency) => dependency.kind === reference.kind && dependency.id === reference.id)
      .map((dependency) => dependency.revision)
    if (matchingRevisions.length > 0 && matchingRevisions.every((revision) => revision === reference.revision)) {
      throw new Error(`Impact reference does not describe a new revision: ${dependencyKey(reference)}`)
    }
  }
  const direct = new Set<string>()
  const paths: Record<string, readonly string[]> = {}
  for (const reference of changed) {
    for (const nodeId of index.directDependentsByReference.get(dependencyKey(reference)) ?? []) {
      direct.add(nodeId)
      paths[nodeId] ??= [dependencyKey(reference), nodeId]
    }
  }
  const affected = new Set(direct)
  const queue = [...direct]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const dependent of index.dependentOutcomeNodes.get(current) ?? []) {
      if (affected.has(dependent)) continue
      affected.add(dependent)
      paths[dependent] = [...(paths[current] ?? [current]), dependent]
      queue.push(dependent)
    }
  }
  return {
    changedReferences: changed,
    directlyAffectedNodeIds: [...direct].sort(),
    affectedNodeIds: [...affected].sort(),
    dependencyPaths: paths,
  }
}

export function propagateImpact(graph: OutcomeGraph, impact: ImpactSet): OutcomeGraph {
  const affected = new Set(impact.affectedNodeIds)
  return outcomeGraphSchema.parse({
    ...graph,
    body: {
      nodes: graph.body.nodes.map((node) => affected.has(node.id)
        ? { ...node, state: 'stale' as const }
        : node),
    },
  })
}
