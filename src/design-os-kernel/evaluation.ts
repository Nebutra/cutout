import { fingerprint } from '@/design-ir/fingerprint'
import {
  artifactGraphSchema,
  evaluationGateSchema,
  evaluationReportSchema,
  evidenceGraphSchema,
  outcomeGraphSchema,
  type ArtifactGraph,
  type EvaluationReport,
  type EvidenceGraph,
  type OutcomeGraph,
  type OutcomeNode,
} from './contracts'

export interface EvaluatorRule {
  readonly id: string
  readonly version: number
  readonly evaluate: (input: {
    readonly outcome: OutcomeNode
    readonly evidenceGraph: EvidenceGraph
    readonly artifactGraph: ArtifactGraph
  }) => Omit<z.infer<typeof evaluationGateSchema>, 'id' | 'outcomeNodeId' | 'evaluator'>
}

import { z } from 'zod'

export async function evaluateOutcomeGraph(input: {
  readonly id: string
  readonly revision: string
  readonly evidenceGraph: EvidenceGraph
  readonly outcomeGraph: OutcomeGraph
  readonly artifactGraph: ArtifactGraph
  readonly evaluatorByOutcomeSchema: Readonly<Record<string, EvaluatorRule>>
  readonly provenance?: EvaluationReport['provenance']
}): Promise<EvaluationReport> {
  const evidenceGraph = evidenceGraphSchema.parse(input.evidenceGraph)
  const outcomeGraph = outcomeGraphSchema.parse(input.outcomeGraph)
  const artifactGraph = artifactGraphSchema.parse(input.artifactGraph)
  const artifactById = new Map(artifactGraph.body.nodes.map((artifact) => [artifact.id, artifact]))
  const gates = outcomeGraph.body.nodes.map((outcome) => {
    const evaluator = input.evaluatorByOutcomeSchema[`${outcome.schema.id}@${outcome.schema.version}`]
    if (!evaluator) throw new Error(`Missing evaluator for outcome schema: ${outcome.schema.id}@${outcome.schema.version}`)
    const gate = evaluationGateSchema.parse({
      id: `gate:${outcome.id}`,
      outcomeNodeId: outcome.id,
      evaluator: { id: evaluator.id, version: evaluator.version },
      ...evaluator.evaluate({ outcome, evidenceGraph, artifactGraph }),
    })
    for (const artifactId of gate.artifactIds) {
      const artifact = artifactById.get(artifactId)
      if (!artifact || !artifact.accepted) {
        throw new Error(`Evaluation references an unavailable accepted artifact: ${artifactId}`)
      }
    }
    return gate
  })
  return evaluationReportSchema.parse({
    protocol: 'design-os.protocol.v1',
    kind: 'evaluation-report',
    schema: { id: 'design-os.evaluation-report', version: 1 },
    identity: { id: input.id, revision: input.revision },
    provenance: input.provenance ?? [],
    body: {
      evidenceGraphRevision: evidenceGraph.identity.revision,
      outcomeGraphRevision: outcomeGraph.identity.revision,
      artifactGraphRevision: artifactGraph.identity.revision,
      gates,
      ready: gates.every((gate) => gate.status === 'passed'),
    },
  })
}

export async function evaluationIdentity(report: EvaluationReport): Promise<string> {
  return fingerprint(evaluationReportSchema.parse(report).body)
}
