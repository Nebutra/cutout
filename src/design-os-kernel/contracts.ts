import { z } from 'zod'

export const KERNEL_PROTOCOL = 'design-os.protocol.v1' as const

export const recordIdSchema = z.string().min(1).max(240)
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
export const timestampSchema = z.number().int().nonnegative()
export const schemaReferenceSchema = z.object({
  id: recordIdSchema,
  version: z.number().int().positive(),
}).strict()
export type SchemaReference = z.infer<typeof schemaReferenceSchema>

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.null(),
  z.boolean(),
  z.number(),
  z.string().max(100_000),
  z.array(jsonValueSchema).max(20_000),
  z.record(z.string().max(240), jsonValueSchema),
]))

export const provenanceReferenceSchema = z.object({
  sourceId: recordIdSchema,
  revision: recordIdSchema,
  relation: z.string().min(1).max(120),
  contentHash: sha256Schema.optional(),
}).strict()
export type ProvenanceReference = z.infer<typeof provenanceReferenceSchema>

const identitySchema = z.object({
  id: recordIdSchema,
  revision: recordIdSchema,
}).strict()

function recordEnvelopeSchema<Kind extends string, Body extends z.ZodType>(
  kind: Kind,
  schemaId: string,
  body: Body,
) {
  return z.object({
    protocol: z.literal(KERNEL_PROTOCOL),
    kind: z.literal(kind),
    schema: z.object({ id: z.literal(schemaId), version: z.literal(1) }).strict(),
    identity: identitySchema,
    provenance: z.array(provenanceReferenceSchema).max(20_000),
    body,
  }).strict()
}

export const dependencyReferenceSchema = z.object({
  kind: z.enum(['evidence', 'outcome', 'lock', 'policy', 'artifact']),
  id: recordIdSchema,
  revision: recordIdSchema,
}).strict()
export type DependencyReference = z.infer<typeof dependencyReferenceSchema>

export const evidenceNodeSchema = z.object({
  id: recordIdSchema,
  revision: recordIdSchema,
  schema: schemaReferenceSchema,
  value: jsonValueSchema,
  provenance: z.array(provenanceReferenceSchema).min(1).max(2_000),
}).strict()
export type EvidenceNode = z.infer<typeof evidenceNodeSchema>

export const evidenceEdgeSchema = z.object({
  from: recordIdSchema,
  to: recordIdSchema,
  relation: z.enum(['depends-on', 'derived-from', 'constrains', 'governs']),
}).strict()

export const evidenceGraphSchema = recordEnvelopeSchema(
  'evidence-graph',
  'design-os.evidence-graph',
  z.object({
    nodes: z.array(evidenceNodeSchema).max(20_000),
    edges: z.array(evidenceEdgeSchema).max(100_000),
  }).strict().superRefine((graph, context) => {
    const nodeIds = graph.nodes.map((node) => node.id)
    if (new Set(nodeIds).size !== nodeIds.length) {
      context.addIssue({ code: 'custom', message: 'Evidence node ids must be unique.' })
    }
    const known = new Set(nodeIds)
    for (const edge of graph.edges) {
      if (!known.has(edge.from) || !known.has(edge.to)) {
        context.addIssue({ code: 'custom', message: `Evidence edge ${edge.from} -> ${edge.to} is unresolved.` })
      }
    }
  }),
)
export type EvidenceGraph = z.infer<typeof evidenceGraphSchema>

export const outcomeNodeStateSchema = z.enum([
  'proposed',
  'stale',
  'planned',
  'running',
  'blocked',
  'needs-repair',
  'satisfied',
])
export type OutcomeNodeState = z.infer<typeof outcomeNodeStateSchema>

export const outcomeNodeSchema = z.object({
  id: recordIdSchema,
  revision: recordIdSchema,
  schema: schemaReferenceSchema,
  recipe: schemaReferenceSchema,
  payload: jsonValueSchema,
  dependencies: z.array(dependencyReferenceSchema).max(10_000),
  state: outcomeNodeStateSchema,
  provenance: z.array(provenanceReferenceSchema).max(2_000),
}).strict()
export type OutcomeNode = z.infer<typeof outcomeNodeSchema>

export const outcomeGraphSchema = recordEnvelopeSchema(
  'outcome-graph',
  'design-os.outcome-graph',
  z.object({
    nodes: z.array(outcomeNodeSchema).max(20_000),
  }).strict().superRefine((graph, context) => {
    const nodeIds = graph.nodes.map((node) => node.id)
    if (new Set(nodeIds).size !== nodeIds.length) {
      context.addIssue({ code: 'custom', message: 'Outcome node ids must be unique.' })
    }
    const known = new Set(nodeIds)
    const revisionById = new Map(graph.nodes.map((node) => [node.id, node.revision]))
    for (const node of graph.nodes) {
      for (const dependency of node.dependencies) {
        if (dependency.kind === 'outcome' && !known.has(dependency.id)) {
          context.addIssue({ code: 'custom', message: `Outcome dependency ${dependency.id} is unresolved.` })
        } else if (dependency.kind === 'outcome' && revisionById.get(dependency.id) !== dependency.revision) {
          context.addIssue({ code: 'custom', message: `Outcome dependency ${dependency.id} has a stale revision.` })
        }
      }
    }
    const dependencies = new Map(graph.nodes.map((node) => [node.id,
      node.dependencies.filter((dependency) => dependency.kind === 'outcome').map((dependency) => dependency.id),
    ]))
    if (hasDependencyCycle(dependencies)) {
      context.addIssue({ code: 'custom', message: 'Outcome dependencies must form a DAG.' })
    }
  }),
)
export type OutcomeGraph = z.infer<typeof outcomeGraphSchema>

export const budgetSchema = z.object({
  attempts: z.number().int().nonnegative(),
  artifacts: z.number().int().nonnegative(),
  bytes: z.number().int().nonnegative(),
  timeMs: z.number().int().nonnegative(),
  spendUnits: z.number().nonnegative(),
}).strict()
export type Budget = z.infer<typeof budgetSchema>

export const capabilityEntrySchema = z.object({
  id: recordIdSchema,
  operation: z.string().min(1).max(120),
  inputSchemas: z.array(schemaReferenceSchema).max(100),
  outputSchemas: z.array(schemaReferenceSchema).min(1).max(100),
  transientFailureCodes: z.array(z.string().min(1).max(120)).max(100),
}).strict().superRefine((entry, context) => {
  for (const [label, values] of [
    ['input schema', entry.inputSchemas.map((schema) => `${schema.id}@${schema.version}`)],
    ['output schema', entry.outputSchemas.map((schema) => `${schema.id}@${schema.version}`)],
    ['transient failure code', entry.transientFailureCodes],
  ] as const) {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: 'custom', message: `Capability ${label}s must be unique.` })
    }
  }
})

export const capabilityCatalogSchema = recordEnvelopeSchema(
  'capability-catalog',
  'design-os.capability-catalog',
  z.object({ entries: z.array(capabilityEntrySchema).max(1_000) }).strict().superRefine((body, context) => {
    const ids = body.entries.map((entry) => entry.id)
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', message: 'Capability ids must be unique.' })
    }
  }),
)
export type CapabilityCatalog = z.infer<typeof capabilityCatalogSchema>

export const outcomeContractSchema = recordEnvelopeSchema(
  'outcome-contract',
  'design-os.outcome-contract',
  z.object({
    evidenceGraph: z.object({ id: recordIdSchema, revision: recordIdSchema, contentHash: sha256Schema }).strict(),
    outcomeGraph: z.object({ id: recordIdSchema, revision: recordIdSchema, contentHash: sha256Schema }).strict(),
    allowedOutcomeNodeIds: z.array(recordIdSchema).max(20_000),
    allowedCapabilityIds: z.array(recordIdSchema).max(1_000),
    allowedTargetIds: z.array(recordIdSchema).max(1_000),
    constraintIds: z.array(recordIdSchema).max(10_000),
    budget: budgetSchema,
  }).strict().superRefine((body, context) => {
    for (const [label, ids] of [
      ['Outcome node', body.allowedOutcomeNodeIds],
      ['Capability', body.allowedCapabilityIds],
      ['Target', body.allowedTargetIds],
      ['Constraint', body.constraintIds],
    ] as const) {
      if (new Set(ids).size !== ids.length) {
        context.addIssue({ code: 'custom', message: `${label} ids must be unique.` })
      }
    }
  }),
)
export type OutcomeContract = z.infer<typeof outcomeContractSchema>

export const executionPlanNodeSchema = z.object({
  id: recordIdSchema,
  outcomeNodeId: recordIdSchema,
  recipe: schemaReferenceSchema,
  capabilityId: recordIdSchema,
  targetId: recordIdSchema,
  dependencyNodeIds: z.array(recordIdSchema).max(10_000),
  inputArtifactIds: z.array(recordIdSchema).max(10_000),
  outputSchema: schemaReferenceSchema,
  constraints: z.array(recordIdSchema).max(10_000),
  transientFailureCodes: z.array(z.string().min(1).max(120)).max(100),
  budget: budgetSchema,
  maxAttempts: z.number().int().positive().max(100),
  deadlineMs: z.number().int().positive(),
}).strict().superRefine((node, context) => {
  for (const [label, ids] of [
    ['dependency', node.dependencyNodeIds],
    ['input artifact', node.inputArtifactIds],
    ['constraint', node.constraints],
    ['transient failure code', node.transientFailureCodes],
  ] as const) {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', message: `Plan node ${label}s must be unique.` })
    }
  }
})
export type ExecutionPlanNode = z.infer<typeof executionPlanNodeSchema>

export const executionPlanSchema = recordEnvelopeSchema(
  'execution-plan',
  'design-os.execution-plan',
  z.object({
    contract: z.object({ id: recordIdSchema, revision: recordIdSchema, contentHash: sha256Schema }).strict(),
    nodes: z.array(executionPlanNodeSchema).max(20_000),
    budget: budgetSchema,
  }).strict().superRefine((body, context) => {
    const nodeIds = body.nodes.map((node) => node.id)
    if (new Set(nodeIds).size !== nodeIds.length) {
      context.addIssue({ code: 'custom', message: 'Execution plan node ids must be unique.' })
    }
    const known = new Set(nodeIds)
    for (const node of body.nodes) {
      if (node.dependencyNodeIds.some((id) => !known.has(id))) {
        context.addIssue({ code: 'custom', message: `Plan node ${node.id} has an unresolved dependency.` })
      }
    }
  }),
)
export type ExecutionPlan = z.infer<typeof executionPlanSchema>

export const frozenDocumentSchema = <Document extends z.ZodType>(document: Document) => z.object({
  document,
  contentHash: sha256Schema,
}).strict()
export interface FrozenDocument<Document> {
  readonly document: Document
  readonly contentHash: string
}

export const reasonPathSchema = z.object({
  code: z.string().min(1).max(120),
  message: z.string().min(1).max(2_000),
  nodeId: recordIdSchema.optional(),
  dependencyPath: z.array(recordIdSchema).max(10_000),
  evidence: z.array(z.object({ key: z.string().min(1).max(120), value: jsonValueSchema }).strict()).max(1_000),
}).strict()
export type ReasonPath = z.infer<typeof reasonPathSchema>

export const artifactNodeSchema = z.object({
  id: recordIdSchema,
  revision: recordIdSchema,
  schema: schemaReferenceSchema,
  mediaType: z.string().min(1).max(120),
  byteLength: z.number().int().positive(),
  contentHash: sha256Schema,
  producerNodeId: recordIdSchema,
  attemptId: recordIdSchema,
  accepted: z.boolean(),
  provenance: z.array(provenanceReferenceSchema).min(1).max(2_000),
}).strict()
export type ArtifactNode = z.infer<typeof artifactNodeSchema>

export const artifactGraphSchema = recordEnvelopeSchema(
  'artifact-graph',
  'design-os.artifact-graph',
  z.object({
    nodes: z.array(artifactNodeSchema).max(20_000),
    dependencies: z.array(z.object({ artifactId: recordIdSchema, dependencyArtifactId: recordIdSchema }).strict()).max(100_000),
  }).strict().superRefine((body, context) => {
    const artifactIds = body.nodes.map((node) => node.id)
    if (new Set(artifactIds).size !== artifactIds.length) {
      context.addIssue({ code: 'custom', message: 'Artifact node ids must be unique.' })
    }
    const known = new Set(artifactIds)
    for (const dependency of body.dependencies) {
      if (!known.has(dependency.artifactId) || !known.has(dependency.dependencyArtifactId)) {
        context.addIssue({
          code: 'custom',
          message: `Artifact dependency ${dependency.artifactId} -> ${dependency.dependencyArtifactId} is unresolved.`,
        })
      }
    }
    const dependencies = new Map(body.nodes.map((node) => [node.id, body.dependencies
      .filter((dependency) => dependency.artifactId === node.id)
      .map((dependency) => dependency.dependencyArtifactId),
    ]))
    if (hasDependencyCycle(dependencies)) {
      context.addIssue({ code: 'custom', message: 'Artifact dependencies must form a DAG.' })
    }
  }),
)
export type ArtifactGraph = z.infer<typeof artifactGraphSchema>

export const evaluationGateSchema = z.object({
  id: recordIdSchema,
  outcomeNodeId: recordIdSchema,
  evaluator: schemaReferenceSchema,
  status: z.enum(['passed', 'blocked', 'degraded', 'repairable']),
  artifactIds: z.array(recordIdSchema).max(10_000),
  reasons: z.array(reasonPathSchema).max(1_000),
}).strict().superRefine((gate, context) => {
  if (gate.status !== 'passed' && gate.reasons.length === 0) {
    context.addIssue({ code: 'custom', message: 'A non-passing evaluation gate requires a reason path.' })
  }
  if (gate.reasons.some((reason) => reason.nodeId && reason.nodeId !== gate.outcomeNodeId)) {
    context.addIssue({ code: 'custom', message: 'Evaluation reasons must belong to the gated Outcome node.' })
  }
})

export const evaluationReportSchema = recordEnvelopeSchema(
  'evaluation-report',
  'design-os.evaluation-report',
  z.object({
    evidenceGraphRevision: recordIdSchema,
    outcomeGraphRevision: recordIdSchema,
    artifactGraphRevision: recordIdSchema,
    gates: z.array(evaluationGateSchema).max(20_000),
    ready: z.boolean(),
  }).strict().superRefine((body, context) => {
    const gateIds = body.gates.map((gate) => gate.id)
    const outcomeNodeIds = body.gates.map((gate) => gate.outcomeNodeId)
    if (new Set(gateIds).size !== gateIds.length || new Set(outcomeNodeIds).size !== outcomeNodeIds.length) {
      context.addIssue({ code: 'custom', message: 'Evaluation gates must be unique by gate and Outcome node.' })
    }
    if (body.ready !== body.gates.every((gate) => gate.status === 'passed')) {
      context.addIssue({ code: 'custom', message: 'Evaluation readiness must match all gate results.' })
    }
  }),
)
export type EvaluationReport = z.infer<typeof evaluationReportSchema>

export const runPhaseSchema = z.enum([
  'understand',
  'contract',
  'plan',
  'authorize',
  'execute',
  'evaluate',
  'repair',
  'deliver',
  'terminal',
])
export type RunPhase = z.infer<typeof runPhaseSchema>

export const runLedgerSchema = recordEnvelopeSchema(
  'run-ledger',
  'design-os.run-ledger',
  z.object({
    contract: z.object({ id: recordIdSchema, revision: recordIdSchema, contentHash: sha256Schema }).strict(),
    plan: z.object({ id: recordIdSchema, revision: recordIdSchema, contentHash: sha256Schema }).strict(),
    phase: runPhaseSchema,
    status: z.enum(['active', 'blocked', 'cancelled', 'failed', 'delivered']),
    budget: z.object({ limit: budgetSchema, used: budgetSchema }).strict(),
    eventCount: z.number().int().nonnegative(),
    reasons: z.array(reasonPathSchema).max(20_000),
  }).strict(),
)
export type RunLedger = z.infer<typeof runLedgerSchema>

export const reproductionEnvelopeSchema = recordEnvelopeSchema(
  'reproduction-envelope',
  'design-os.reproduction-envelope',
  z.object({
    runId: recordIdSchema,
    terminalStatus: z.enum(['cancelled', 'failed', 'delivered']),
    sources: z.array(z.object({ id: recordIdSchema, revision: recordIdSchema, contentHash: sha256Schema }).strict()).min(1).max(20_000),
    dependencies: z.array(dependencyReferenceSchema).max(100_000),
    contract: z.object({ id: recordIdSchema, revision: recordIdSchema, contentHash: sha256Schema }).strict(),
    plan: z.object({ id: recordIdSchema, revision: recordIdSchema, contentHash: sha256Schema }).strict(),
    routes: z.array(z.object({ nodeId: recordIdSchema, capabilityId: recordIdSchema, targetId: recordIdSchema, parametersHash: sha256Schema }).strict()).max(20_000),
    attempts: z.array(z.object({
      id: recordIdSchema,
      nodeId: recordIdSchema,
      status: z.enum(['succeeded', 'failed', 'cancelled', 'timed-out']),
      receiptIds: z.array(recordIdSchema).max(1_000),
      reasons: z.array(reasonPathSchema).max(1_000),
    }).strict()).max(100_000),
    receipts: z.array(z.object({ id: recordIdSchema, contentHash: sha256Schema }).strict()).max(100_000),
    outputHashes: z.array(sha256Schema).max(20_000),
    replayClaim: z.literal('provenance-replayable'),
  }).strict().superRefine((body, context) => {
    for (const [label, ids] of [
      ['source', body.sources.map((source) => `${source.id}@${source.revision}`)],
      ['dependency', body.dependencies.map((dependency) => `${dependency.kind}:${dependency.id}@${dependency.revision}`)],
      ['route', body.routes.map((route) => route.nodeId)],
      ['attempt', body.attempts.map((attempt) => attempt.id)],
      ['receipt', body.receipts.map((receipt) => receipt.id)],
      ['output hash', body.outputHashes],
    ] as const) {
      if (new Set(ids).size !== ids.length) {
        context.addIssue({ code: 'custom', message: `Reproduction ${label}s must be unique.` })
      }
    }
  }),
)
export type ReproductionEnvelope = z.infer<typeof reproductionEnvelopeSchema>

export const kernelRecordSchemas = {
  'design-os.evidence-graph': evidenceGraphSchema,
  'design-os.outcome-graph': outcomeGraphSchema,
  'design-os.outcome-contract': outcomeContractSchema,
  'design-os.capability-catalog': capabilityCatalogSchema,
  'design-os.execution-plan': executionPlanSchema,
  'design-os.run-ledger': runLedgerSchema,
  'design-os.artifact-graph': artifactGraphSchema,
  'design-os.evaluation-report': evaluationReportSchema,
  'design-os.reproduction-envelope': reproductionEnvelopeSchema,
} as const

export type KernelRecordSchemaId = keyof typeof kernelRecordSchemas

function hasDependencyCycle(dependencies: ReadonlyMap<string, readonly string[]>): boolean {
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    for (const dependency of dependencies.get(id) ?? []) {
      if (visit(dependency)) return true
    }
    visiting.delete(id)
    visited.add(id)
    return false
  }
  return [...dependencies.keys()].some(visit)
}
