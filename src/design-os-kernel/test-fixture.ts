import {
  artifactGraphSchema,
  capabilityCatalogSchema,
  evidenceGraphSchema,
  outcomeGraphSchema,
  type ArtifactGraph,
  type Budget,
  type CapabilityCatalog,
  type EvidenceGraph,
  type EvaluationReport,
  type ExecutionPlan,
  type OutcomeContract,
  type OutcomeGraph,
} from './contracts'
import { compileExecutionPlan, compileOutcomeContract, type RecipeCompiler } from './compiler'
import { evaluateOutcomeGraph } from './evaluation'

export const fixtureBudget: Budget = {
  attempts: 10,
  artifacts: 10,
  bytes: 10_000,
  timeMs: 10_000,
  spendUnits: 10,
}

export const fixtureNodeBudget: Budget = {
  attempts: 2,
  artifacts: 2,
  bytes: 2_000,
  timeMs: 2_000,
  spendUnits: 2,
}

export function fixtureEvidenceGraph(): EvidenceGraph {
  return evidenceGraphSchema.parse({
    protocol: 'design-os.protocol.v1',
    kind: 'evidence-graph',
    schema: { id: 'design-os.evidence-graph', version: 1 },
    identity: { id: 'evidence:fixture', revision: 'evidence:revision:1' },
    provenance: [],
    body: {
      nodes: [{
        id: 'evidence:brief',
        revision: 'brief:1',
        schema: { id: 'fixture.brief', version: 1 },
        value: { instruction: 'Produce a portable structured result.' },
        provenance: [{ sourceId: 'source:fixture', revision: 'source:1', relation: 'normalized-from' }],
      }],
      edges: [],
    },
  })
}

export function fixtureOutcomeGraph(): OutcomeGraph {
  return outcomeGraphSchema.parse({
    protocol: 'design-os.protocol.v1',
    kind: 'outcome-graph',
    schema: { id: 'design-os.outcome-graph', version: 1 },
    identity: { id: 'outcome:fixture', revision: 'outcome:revision:1' },
    provenance: [],
    body: {
      nodes: [{
        id: 'outcome:structured',
        revision: 'outcome-node:1',
        schema: { id: 'fixture.structured-outcome', version: 1 },
        recipe: { id: 'fixture.structured-recipe', version: 1 },
        payload: { format: 'application/json' },
        dependencies: [{ kind: 'evidence', id: 'evidence:brief', revision: 'brief:1' }],
        state: 'proposed',
        provenance: [],
      }],
    },
  })
}

export function fixtureCatalog(capabilityId = 'capability:structured'): CapabilityCatalog {
  return capabilityCatalogSchema.parse({
    protocol: 'design-os.protocol.v1',
    kind: 'capability-catalog',
    schema: { id: 'design-os.capability-catalog', version: 1 },
    identity: { id: 'catalog:fixture', revision: 'catalog:1' },
    provenance: [],
    body: {
      entries: [{
        id: capabilityId,
        operation: 'produce-structured-output',
        inputSchemas: [{ id: 'fixture.brief', version: 1 }],
        outputSchemas: [{ id: 'fixture.structured-outcome', version: 1 }],
        transientFailureCodes: ['provider-timeout', 'rate-limit', 'host-recovery-interrupted'],
      }],
    },
  })
}

export function fixtureRecipe(capabilityId = 'capability:structured', targetId = 'target:result'): RecipeCompiler {
  return {
    id: 'fixture.structured-recipe',
    version: 1,
    compile: () => [{
      capabilityId,
      targetId,
      dependencyNodeIds: [],
      inputArtifactIds: [],
      outputSchema: { id: 'fixture.structured-outcome', version: 1 },
      constraints: ['constraint:fact-lineage'],
      transientFailureCodes: ['provider-timeout', 'rate-limit', 'host-recovery-interrupted'],
      budget: fixtureNodeBudget,
      maxAttempts: 2,
      deadlineMs: 1_000,
    }],
  }
}

export async function createFixtureCompilation(input?: {
  readonly capabilityId?: string
  readonly targetId?: string
}): Promise<{
  readonly evidenceGraph: EvidenceGraph
  readonly outcomeGraph: OutcomeGraph
  readonly catalog: CapabilityCatalog
  readonly contract: OutcomeContract
  readonly plan: ExecutionPlan
  readonly artifactGraph: ArtifactGraph
  readonly evaluation: EvaluationReport
}> {
  const capabilityId = input?.capabilityId ?? 'capability:structured'
  const targetId = input?.targetId ?? 'target:result'
  const evidenceGraph = fixtureEvidenceGraph()
  const outcomeGraph = fixtureOutcomeGraph()
  const catalog = fixtureCatalog(capabilityId)
  const contract = await compileOutcomeContract({
    id: 'contract:fixture',
    revision: 'contract:1',
    evidenceGraph: evidenceGraph.identity,
    evidenceGraphValue: evidenceGraph,
    outcomeGraph,
    allowedCapabilityIds: [capabilityId],
    allowedTargetIds: [targetId],
    constraintIds: ['constraint:fact-lineage'],
    budget: fixtureBudget,
  })
  const plan = await compileExecutionPlan({
    id: 'plan:fixture',
    revision: 'plan:1',
    contract,
    outcomeGraph,
    recipes: [fixtureRecipe(capabilityId, targetId)],
    budget: fixtureBudget,
  })
  const artifactGraph = artifactGraphSchema.parse({
    protocol: 'design-os.protocol.v1',
    kind: 'artifact-graph',
    schema: { id: 'design-os.artifact-graph', version: 1 },
    identity: { id: 'artifacts:fixture', revision: 'artifacts:1' },
    provenance: [],
    body: { nodes: [], dependencies: [] },
  })
  const evaluation = await evaluateOutcomeGraph({
    id: 'evaluation:fixture',
    revision: 'evaluation:1',
    evidenceGraph,
    outcomeGraph,
    artifactGraph,
    evaluatorByOutcomeSchema: {
      'fixture.structured-outcome@1': {
        id: 'fixture.structured-evaluator',
        version: 1,
        evaluate: ({ outcome }) => ({
          status: 'passed',
          artifactIds: [],
          reasons: [{
            code: 'fixture-satisfied',
            message: 'Fixture outcome is satisfied.',
            nodeId: outcome.id,
            dependencyPath: [outcome.id],
            evidence: [],
          }],
        }),
      },
    },
  })
  return { evidenceGraph, outcomeGraph, catalog, contract, plan, artifactGraph, evaluation }
}
