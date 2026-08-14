import { fingerprint } from '@/design-ir/fingerprint'
import {
  evidenceGraphSchema,
  executionPlanSchema,
  outcomeContractSchema,
  outcomeGraphSchema,
  type Budget,
  type ExecutionPlan,
  type ExecutionPlanNode,
  type EvidenceGraph,
  type OutcomeContract,
  type OutcomeGraph,
  type OutcomeNode,
} from './contracts'

export interface RecipeCompiler {
  readonly id: string
  readonly version: number
  readonly compile: (node: OutcomeNode) => readonly Omit<ExecutionPlanNode, 'id' | 'outcomeNodeId' | 'recipe'>[]
}

export async function compileOutcomeContract(input: {
  readonly id: string
  readonly revision: string
  readonly evidenceGraph: { readonly id: string, readonly revision: string }
  readonly evidenceGraphValue: EvidenceGraph
  readonly outcomeGraph: OutcomeGraph
  readonly allowedCapabilityIds: readonly string[]
  readonly allowedTargetIds: readonly string[]
  readonly constraintIds: readonly string[]
  readonly budget: Budget
  readonly provenance?: OutcomeContract['provenance']
}): Promise<OutcomeContract> {
  const evidence = evidenceGraphSchema.parse(input.evidenceGraphValue)
  const graph = outcomeGraphSchema.parse(input.outcomeGraph)
  if (evidence.identity.id !== input.evidenceGraph.id
    || evidence.identity.revision !== input.evidenceGraph.revision) {
    throw new Error('EvidenceGraph identity does not match the Contract source binding.')
  }
  const evidenceRevisionById = new Map(evidence.body.nodes.map((node) => [node.id, node.revision]))
  const outcomeRevisionById = new Map(graph.body.nodes.map((node) => [node.id, node.revision]))
  for (const node of graph.body.nodes) {
    for (const dependency of node.dependencies) {
      const actualRevision = dependency.kind === 'evidence'
        ? evidenceRevisionById.get(dependency.id)
        : dependency.kind === 'outcome'
          ? outcomeRevisionById.get(dependency.id)
          : undefined
      if ((dependency.kind === 'evidence' || dependency.kind === 'outcome')
        && actualRevision !== dependency.revision) {
        throw new Error(`Outcome dependency revision is unresolved: ${dependency.kind}:${dependency.id}@${dependency.revision}`)
      }
    }
  }
  return outcomeContractSchema.parse({
    protocol: 'design-os.protocol.v1',
    kind: 'outcome-contract',
    schema: { id: 'design-os.outcome-contract', version: 1 },
    identity: { id: input.id, revision: input.revision },
    provenance: input.provenance ?? [],
    body: {
      evidenceGraph: {
        ...input.evidenceGraph,
        contentHash: await fingerprint(evidence),
      },
      outcomeGraph: {
        id: graph.identity.id,
        revision: graph.identity.revision,
        contentHash: await fingerprint(graph),
      },
      allowedOutcomeNodeIds: graph.body.nodes.map((node) => node.id),
      allowedCapabilityIds: [...input.allowedCapabilityIds],
      allowedTargetIds: [...input.allowedTargetIds],
      constraintIds: [...input.constraintIds],
      budget: input.budget,
    },
  })
}

export async function compileExecutionPlan(input: {
  readonly id: string
  readonly revision: string
  readonly contract: OutcomeContract
  readonly outcomeGraph: OutcomeGraph
  readonly recipes: readonly RecipeCompiler[]
  readonly budget: Budget
  readonly provenance?: ExecutionPlan['provenance']
}): Promise<ExecutionPlan> {
  const contract = outcomeContractSchema.parse(input.contract)
  const graph = outcomeGraphSchema.parse(input.outcomeGraph)
  if (graph.identity.id !== contract.body.outcomeGraph.id
    || graph.identity.revision !== contract.body.outcomeGraph.revision
    || await fingerprint(graph) !== contract.body.outcomeGraph.contentHash) {
    throw new Error('OutcomeGraph does not match the frozen Contract binding.')
  }
  const recipes = new Map(input.recipes.map((recipe) => [`${recipe.id}@${recipe.version}`, recipe]))
  const nodes = graph.body.nodes.flatMap((node) => {
    const recipe = recipes.get(`${node.recipe.id}@${node.recipe.version}`)
    if (!recipe) throw new Error(`Missing recipe compiler: ${node.recipe.id}@${node.recipe.version}`)
    return recipe.compile(node).map((planNode, index) => ({
      ...planNode,
      id: `${node.id}:step:${index + 1}`,
      outcomeNodeId: node.id,
      recipe: node.recipe,
    }))
  })
  const planIdByOutcome = new Map<string, string[]>()
  for (const node of nodes) {
    const ids = planIdByOutcome.get(node.outcomeNodeId) ?? []
    ids.push(node.id)
    planIdByOutcome.set(node.outcomeNodeId, ids)
  }
  const resolvedNodes = nodes.map((node) => {
    const outcome = graph.body.nodes.find((candidate) => candidate.id === node.outcomeNodeId)!
    const outcomeDependencies = outcome.dependencies
      .filter((dependency) => dependency.kind === 'outcome')
      .flatMap((dependency) => planIdByOutcome.get(dependency.id) ?? [])
    return { ...node, dependencyNodeIds: [...new Set([...outcomeDependencies, ...node.dependencyNodeIds])] }
  })
  return executionPlanSchema.parse({
    protocol: 'design-os.protocol.v1',
    kind: 'execution-plan',
    schema: { id: 'design-os.execution-plan', version: 1 },
    identity: { id: input.id, revision: input.revision },
    provenance: input.provenance ?? [],
    body: {
      contract: {
        id: contract.identity.id,
        revision: contract.identity.revision,
        contentHash: await fingerprint(contract),
      },
      nodes: resolvedNodes,
      budget: input.budget,
    },
  })
}
