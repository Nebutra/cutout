import { describe, expect, it } from 'vitest'
import { artifactGraphSchema } from '@/design-os-kernel'
import { buildAttributeIndex, buildCategoryIndex } from './catalog'
import {
  createCommerceKernelEvaluation,
  evaluateCommerceProduction,
} from './evaluation'
import { normalizeProductRecord } from './normalizer'
import { createCommerceEvidenceGraph, createCommerceOutcomeGraph } from './profile'
import { compileCommerceProduction } from './recipes'
import {
  fixtureAttributeCatalog,
  fixtureCategoryCatalog,
  fixtureProductRecord,
  fixtureReceiptsAndPublications,
} from './commerce-profile.test-fixture'

describe('Commerce mocked receipts, quality gates and targeted repair (P6-P7)', () => {
  async function fixture() {
    const facts = normalizeProductRecord({ file: 'product.json', contents: JSON.stringify(fixtureProductRecord) })
    const categoryIndex = buildCategoryIndex(fixtureCategoryCatalog)
    const attributeIndex = buildAttributeIndex(fixtureAttributeCatalog, categoryIndex)
    const evidenceGraph = createCommerceEvidenceGraph({ facts })
    const outcomeGraph = createCommerceOutcomeGraph({ facts })
    const { plan } = await compileCommerceProduction({
      evidenceGraph,
      outcomeGraph,
      sourceImageArtifactIds: [`artifact:sha256:${'a'.repeat(64)}`],
    })
    return { facts, categoryIndex, attributeIndex, evidenceGraph, outcomeGraph, plan }
  }

  it('accepts three descriptions, six images, one playable video and one evidence-derived strategy', async () => {
    const context = await fixture()
    const mocked = fixtureReceiptsAndPublications(context)
    const evaluation = evaluateCommerceProduction({ ...context, ...mocked })

    expect(mocked.receipts).toHaveLength(11)
    expect(mocked.publications).toHaveLength(11)
    expect(evaluation).toMatchObject({ ready: true, imageUsability: { usable: 6, required: 6, ratio: 1 } })
    expect(evaluation.findings).toEqual([])
    expect(mocked.strategy.factIds).toEqual(expect.arrayContaining(context.facts.titleFactIds))
    expect(mocked.strategy.planNodeIds).toHaveLength(11)
    expect(mocked.strategy.routeIds.length).toBeGreaterThan(0)
    expect(mocked.strategy.receiptIds).toHaveLength(10)
  })

  it('repairs only the rejected frontier, retains valid siblings and stays above 80% image usability', async () => {
    const context = await fixture()
    const finding = {
      code: 'media-dimensions-invalid',
      message: 'Media dimensions are too small.',
      outcomeNodeId: 'outcome:commerce:detail-image:3',
      artifactId: 'artifact:outcome:commerce:detail-image:3',
      severity: 'blocking' as const,
      factIds: [],
    }
    const mocked = fixtureReceiptsAndPublications({
      ...context,
      invalidRole: 'detail-image:3',
      strategyFindings: [finding],
    })
    const evaluation = evaluateCommerceProduction({ ...context, ...mocked })

    expect(evaluation.ready).toBe(false)
    expect(evaluation.imageUsability).toEqual({ usable: 5, required: 6, ratio: 5 / 6 })
    expect(evaluation.failedOutcomeNodeIds).toEqual(['outcome:commerce:detail-image:3'])
    expect(evaluation.repairPlanNodeIds).toEqual(['outcome:commerce:detail-image:3:step:1'])
    expect(evaluation.validArtifactIds).toContain('artifact:outcome:commerce:main-image')
    expect(evaluation.validArtifactIds).toContain('artifact:outcome:commerce:strategy-document')
    expect(evaluation.validArtifactIds).not.toContain('artifact:outcome:commerce:detail-image:3')
  })

  it('projects commerce findings through Kernel evaluator gates without invalidating accepted siblings', async () => {
    const context = await fixture()
    const finding = {
      code: 'media-dimensions-invalid',
      message: 'Media dimensions are too small.',
      outcomeNodeId: 'outcome:commerce:detail-image:3',
      artifactId: 'artifact:outcome:commerce:detail-image:3',
      severity: 'blocking' as const,
      factIds: [],
    }
    const mocked = fixtureReceiptsAndPublications({
      ...context,
      invalidRole: 'detail-image:3',
      strategyFindings: [finding],
    })
    const evaluation = evaluateCommerceProduction({ ...context, ...mocked })
    const artifactGraph = artifactGraphSchema.parse({
      protocol: 'design-os.protocol.v1',
      kind: 'artifact-graph',
      schema: { id: 'design-os.artifact-graph', version: 1 },
      identity: { id: 'artifacts:commerce', revision: 'artifacts:commerce:revision:1' },
      provenance: [],
      body: {
        nodes: mocked.publications.map((publication, index) => ({
          id: publication.artifactId,
          revision: `${publication.artifactId}:revision:1`,
          schema: context.outcomeGraph.body.nodes.find((node) => node.id === publication.outcomeNodeId)!.schema,
          mediaType: 'application/json',
          byteLength: 1_000,
          contentHash: index.toString(16).padStart(64, '0'),
          producerNodeId: `${publication.outcomeNodeId}:step:1`,
          attemptId: `attempt:${index + 1}`,
          accepted: true,
          provenance: [{ sourceId: `receipt:${index + 1}`, revision: 'receipt:1', relation: 'produced-by' }],
        })),
        dependencies: [],
      },
    })
    const kernelEvaluation = await createCommerceKernelEvaluation({
      id: 'evaluation:commerce',
      revision: 'evaluation:commerce:revision:1',
      evidenceGraph: context.evidenceGraph,
      outcomeGraph: context.outcomeGraph,
      artifactGraph,
      evaluation,
      publications: mocked.publications,
    })

    expect(kernelEvaluation.body.ready).toBe(false)
    expect(kernelEvaluation.body.gates.find((gate) => gate.outcomeNodeId === finding.outcomeNodeId)?.status)
      .toBe('repairable')
    expect(kernelEvaluation.body.gates.find((gate) => gate.outcomeNodeId === 'outcome:commerce:main-image'))
      .toMatchObject({ status: 'passed', artifactIds: ['artifact:outcome:commerce:main-image'] })
  })

  it('records a repaired frontier in strategy evidence while preserving every sibling publication', async () => {
    const context = await fixture()
    const historicalFinding = {
      code: 'media-dimensions-invalid',
      message: 'The first detail-image attempt was too small.',
      outcomeNodeId: 'outcome:commerce:detail-image:3',
      artifactId: 'artifact:outcome:commerce:detail-image:3:attempt:1',
      severity: 'blocking' as const,
      factIds: [],
    }
    const mocked = fixtureReceiptsAndPublications({
      ...context,
      repairedRole: 'detail-image:3',
      strategyFindings: [historicalFinding],
    })
    const evaluation = evaluateCommerceProduction({
      ...context,
      ...mocked,
      validationHistory: [historicalFinding],
    })

    expect(evaluation.ready).toBe(true)
    expect(evaluation.repairPlanNodeIds).toEqual([])
    expect(evaluation.validArtifactIds).toHaveLength(11)
    expect(mocked.strategy.validationFindingCodes).toEqual(['media-dimensions-invalid'])
    expect(mocked.strategy.repairReceiptIds).toEqual(['receipt:outcome:commerce:detail-image:3:step:1:attempt:2'])
    expect(mocked.publications.find((publication) => publication.outcomeNodeId === 'outcome:commerce:main-image')?.artifactId)
      .toBe('artifact:outcome:commerce:main-image')
  })

  it('rejects media whose declared kind does not match the planned semantic role', async () => {
    const context = await fixture()
    const mocked = fixtureReceiptsAndPublications(context)
    const publications = mocked.publications.map((publication) => publication.outcomeNodeId === 'outcome:commerce:product-video'
      ? {
          ...publication,
          mediaType: 'image/png',
          payload: { ...publication.payload, mediaKind: 'image' as const, mediaType: 'image/png', playable: undefined },
        }
      : publication)
    const evaluation = evaluateCommerceProduction({ ...context, publications, receipts: mocked.receipts })

    expect(evaluation.findings.map((finding) => finding.code)).toContain('media-kind-mismatch')
    expect(evaluation.ready).toBe(false)
  })

  it('rejects duplicate strategy evidence ids instead of collapsing them during closure checks', async () => {
    const context = await fixture()
    const mocked = fixtureReceiptsAndPublications(context)
    const publications = mocked.publications.map((publication) => publication.outcomeNodeId === 'outcome:commerce:strategy-document'
      ? {
          ...publication,
          payload: {
            ...mocked.strategy,
            receiptIds: [...mocked.strategy.receiptIds, mocked.strategy.receiptIds[0]!],
          },
        }
      : publication)
    expect(() => evaluateCommerceProduction({ ...context, publications, receipts: mocked.receipts }))
      .toThrow(/Strategy receipt ids must be unique/)
  })
})
