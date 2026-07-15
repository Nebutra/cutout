import { describe, expect, it } from 'vitest'
import type { DesignDocument } from '@/design-ir'
import { buildLiveDesignOsWorkbenchModel } from './live-model'

const timestamp = '2026-07-11T12:00:00.000Z'

function document(): DesignDocument {
  return {
    version: 'design-ir.v1',
    meta: { id: 'project:live', title: 'Live', createdAt: timestamp, updatedAt: timestamp },
    revision: { id: 'revision:4', number: 4, createdAt: timestamp, author: { kind: 'human', id: 'human:1' } },
    needs: [],
    sources: [{
      id: 'source:refero', kind: 'url', role: 'reference', title: 'Refero',
      license: { kind: 'unknown', rationale: 'User supplied.' },
      content: [{ id: 'content:refero', uri: 'https://styles.refero.design/' }],
    }],
    brands: [],
    tokens: [{ id: 'token:primary', name: 'Primary', kind: 'color', value: '#00875a' }],
    components: [], materials: [], provenance: [], relations: [],
  }
}

describe('live Design OS workbench model', () => {
  it('projects real sources and exposes only the deliverable executable from current facts', () => {
    const model = buildLiveDesignOsWorkbenchModel(document())

    expect(model.sources).toEqual([expect.objectContaining({
      id: 'source:refero', href: 'https://styles.refero.design/',
      license: 'Unknown · User supplied.', provenance: 'Not recorded',
    })])
    expect(model.kits.find((item) => item.id === 'kit:design-system')).toMatchObject({ readiness: 'ready' })
    expect(model.kits.find((item) => item.id === 'kit:brand')).toMatchObject({
      readiness: 'blocked', blockers: expect.arrayContaining([expect.stringContaining('BrandKitDefinition')]),
    })
    expect(model.components[0]).toMatchObject({
      readiness: 'blocked', blockers: expect.arrayContaining([expect.stringContaining('candidate declarations')]),
    })
    expect(model.starters.every((item) => item.readiness === 'blocked')).toBe(true)
    expect(model.delivery?.targets.find((target) => target.id === 'delivery:design-system')).toMatchObject({ available: true })
    expect(model.delivery?.targets.find((target) => target.id === 'delivery:notion')).toMatchObject({ available: false, unavailableReason: 'No authorized Notion host/session.' })
  })

  it('restores only Delivery Center plans bound to the current Design IR revision', () => {
    const current = document()
    const plan = { protocol: 'cutout.delivery-center.v1' as const, id: 'delivery:plan', requestId: 'delivery:request', outcomeId: 'outcome:one', outcomeRevision: 'run:one', designRevision: { documentId: current.meta.id, revisionId: current.revision.id, revisionNumber: current.revision.number }, targets: [], totalEstimatedCostUsd: 0, currency: 'USD' as const, requiresApproval: true as const, createdAt: timestamp }
    expect(buildLiveDesignOsWorkbenchModel(current, {}, { deliveryPlan: plan }).delivery?.plan?.id).toBe('delivery:plan')
    expect(buildLiveDesignOsWorkbenchModel(current, {}, { deliveryPlan: { ...plan, designRevision: { ...plan.designRevision, revisionId: 'revision:old' } } }).delivery?.plan).toBeUndefined()
  })

  it('does not carry an export receipt across DesignDocument revisions', () => {
    const model = buildLiveDesignOsWorkbenchModel(document(), {}, {
      designKitReceipt: { id: 'receipt:old', title: 'Old export', detail: '/old' },
    })
    expect(model.kits[0]?.receipt).toMatchObject({ id: 'receipt:old' })
  })

  it('does not expose a source preview after its reviewed revision becomes stale', () => {
    const current = document()
    const preview = {
      kind: 'source-ingest-preview' as const,
      base: {
        documentId: current.meta.id,
        revisionId: 'revision:previous',
        revisionNumber: current.revision.number - 1,
      },
      patch: { sources: [], provenance: [] },
      skipped: [],
      impact: {
        sourcesAdded: 0,
        provenanceAdded: 0,
        nextRevisionNumber: current.revision.number,
        noChanges: true,
      },
    }

    expect(buildLiveDesignOsWorkbenchModel(current, {}, { ingestPreview: preview }).ingestPreview).toBeUndefined()
  })
})
