import { describe, expect, it } from 'vitest'
import type { OutcomeRuntimeState } from '@/agent-runtime/outcome-runtime'
import type { DesignDocument } from '@/design-ir'
import { approveCurrentDeliverables, libraryItemFromApproval } from './approval'

const at = '2026-07-12T00:00:00.000Z', hash = 'a'.repeat(64)
const document = { version: 'design-ir.v1', meta: { id: 'project.alpha', title: 'Alpha', createdAt: at, updatedAt: at }, revision: { id: 'revision.2', number: 2, createdAt: at, author: { kind: 'human', id: 'user' } }, needs: [], sources: [{ id: 'source.one', kind: 'photo', role: 'brand-asset', title: 'Source', license: { kind: 'spdx', identifier: 'Apache-2.0' }, content: [{ id: 'content.source', uri: 'sha256:a', sha256: hash }] }], brands: [], tokens: [], components: [], materials: [{ id: 'material:prototype-page:home', kind: 'prototype-page', name: 'Home', currentRevisionId: 'material-revision.1', revisions: [{ id: 'material-revision.1', ordinal: 1, createdAt: at, provenanceId: 'provenance.1', content: { id: 'content.home', uri: 'sha256:a', sha256: hash, mediaType: 'image/png' } }] }], provenance: [{ id: 'provenance.1', operation: 'generate', sourceIds: ['source.one'], actor: { kind: 'agent', id: 'agent' }, recordedAt: at }], relations: [] } satisfies DesignDocument
const outcome = { version: 'outcome-runtime.v1', contract: { id: 'outcome.alpha', intent: 'Create home', requirements: [] }, runId: 'run.alpha', status: 'ready-to-deliver', materials: [], evaluation: { status: 'satisfied', missing: [] }, events: [] } satisfies OutcomeRuntimeState

describe('approved deliverable receipts', () => {
  it('binds approval to outcome, Design IR, material revision, license and quality evidence', async () => {
    const [receipt] = await approveCurrentDeliverables({ document, outcome, approvalId: 'approval.one', approvedAt: at })
    expect(receipt).toMatchObject({ approvalId: 'approval.one', projectId: 'project.alpha', outcome: { id: 'outcome.alpha', runId: 'run.alpha' }, designRevision: { revisionId: 'revision.2', revisionNumber: 2 }, material: { id: 'material:prototype-page:home', revisionId: 'material-revision.1', contentSha256: hash }, license: { kind: 'spdx', identifier: 'Apache-2.0' }, quality: [{ gate: 'schema' }, { gate: 'provenance' }] })
    const item = await libraryItemFromApproval(receipt!)
    expect(item).toMatchObject({ kind: 'visual-asset', origin: { projectId: 'project.alpha', runId: 'run.alpha', sourceRevision: 'revision.2' }, contentSha256: receipt?.library.contentSha256 })
  })
  it('rejects an unready outcome and tampered content evidence', async () => {
    await expect(approveCurrentDeliverables({ document, outcome: { ...outcome, status: 'running' }, approvalId: 'approval.one', approvedAt: at })).rejects.toThrow('ready-to-deliver')
    const [receipt] = await approveCurrentDeliverables({ document, outcome, approvalId: 'approval.one', approvedAt: at })
    await expect(libraryItemFromApproval({ ...receipt!, library: { ...receipt!.library, contentSha256: 'b'.repeat(64) } })).rejects.toThrow('no longer matches')
  })
})
