import { describe, expect, it, vi } from 'vitest'
import { createMemoryVisualDecompositionStore, executeVisualDecomposition, groupReviewedElements, planVisualDecomposition, visualDecompositionTaskSchema, type DecompositionElement, type VisualDecompositionProposal } from './decomposition'

const hash = 'a'.repeat(64)
const task = () => visualDecompositionTaskSchema.parse({
  version: 'visual-decomposition-task.v1', taskId: 'decompose.1', source: { artifactId: 'source.1', sha256: hash, mediaType: 'image/png', width: 1200, height: 800, provenanceId: 'prov.1' },
  batching: { maximumItems: 2, concurrency: 2 }, retry: { maximumAttempts: 2 },
})
const proposal: VisualDecompositionProposal = {
  version: 'visual-decomposition-proposal.v1', proposalId: 'proposal.1', taskId: 'decompose.1', sourceSha256: hash,
  elements: [
    { id: 'logo', name: 'Logo', semantic: 'identity', style: 'flat', sourceBounds: { space: 'source-pixels', x: 0, y: 0, width: 100, height: 80 }, include: true },
    { id: 'button', name: 'Button', semantic: 'control', style: 'flat', sourceBounds: { space: 'source-pixels', x: 100, y: 0, width: 200, height: 80 }, include: true },
    { id: 'photo', name: 'Photo', semantic: 'media', style: 'photographic', sourceBounds: { space: 'source-pixels', x: 0, y: 100, width: 500, height: 400 }, include: true },
  ], provenanceIds: ['prov.1'], proposedAt: 1,
}

describe('visual decomposition DAG', () => {
  it('plans stable style/semantic batches and hashes every effective input', async () => {
    const first = await planVisualDecomposition(task())
    const second = await planVisualDecomposition(task())
    expect(first.inputHash).toMatch(/^[a-f0-9]{64}$/)
    expect(second.inputHash).toBe(first.inputHash)
    expect(first.nodes.map((node) => node.operation)).toEqual(['propose', 'review', 'apply'])
    expect(groupReviewedElements(proposal.elements, 2).map((batch) => batch.batchKey)).toEqual(['flat:control', 'flat:identity', 'photographic:media'])
  })

  it('requires an approved immutable review artifact before deterministic apply', async () => {
    const apply = vi.fn()
    await expect(executeVisualDecomposition('run.1', await planVisualDecomposition(task()), {
      proposer: { propose: async () => proposal }, reviewer: { review: async ({ proposal }) => ({ version: 'visual-decomposition-review.v1', reviewId: 'review.1', proposalId: proposal.proposalId, taskId: proposal.taskId, status: 'rejected', reviewedElements: proposal.elements, evidence: ['wrong bounds'], reviewedAt: 2 }) },
      applicator: { apply }, store: createMemoryVisualDecompositionStore(), append: vi.fn(), now: () => 3,
    })).rejects.toThrow(/approved review/)
    expect(apply).not.toHaveBeenCalled()
  })

  it('applies approved batches with bounded concurrency and records source/sheet coordinates', async () => {
    let active = 0, peak = 0
    const result = await executeVisualDecomposition('run.1', await planVisualDecomposition(task()), {
      proposer: { propose: async () => proposal },
      reviewer: { review: async ({ proposal }) => ({ version: 'visual-decomposition-review.v1', reviewId: 'review.1', proposalId: proposal.proposalId, taskId: proposal.taskId, status: 'approved', reviewedElements: proposal.elements, evidence: ['bounds checked'], reviewedAt: 2 }) },
      applicator: { apply: async ({ elements, batchKey }) => { active++; peak = Math.max(peak, active); await new Promise((resolve) => setTimeout(resolve, 1)); active--; return { sheetArtifactId: `sheet.${batchKey}`, sheetSha256: hash, width: 1024, height: 1024, assets: elements.map((element, index) => ({ elementId: element.id, artifactId: `asset.${element.id}`, sha256: hash, sourceBounds: element.sourceBounds, sheetBounds: { space: 'sheet-pixels' as const, x: index * 100, y: 0, width: 90, height: 90 }, provenanceId: `prov.${element.id}` })) } } },
      store: createMemoryVisualDecompositionStore(), append: vi.fn(), now: () => 3,
    })
    expect(peak).toBe(2)
    expect(result.receipt.status).toBe('succeeded')
    expect(result.receipt.assets[0]).toMatchObject({ sourceBounds: { space: 'source-pixels' }, sheetBounds: { space: 'sheet-pixels' } })
  })

  it('reuses successful batches after local retry and is idempotent after completion', async () => {
    const store = createMemoryVisualDecompositionStore(); let fail = true
    const apply = vi.fn(async ({ elements, batchKey }: { elements: readonly DecompositionElement[]; batchKey: string }) => {
      if (batchKey === 'photographic:media' && fail) throw new Error('temporary')
      return { sheetArtifactId: `sheet.${batchKey}`, sheetSha256: hash, width: 1024, height: 1024, assets: elements.map((element) => ({ elementId: element.id, artifactId: `asset.${element.id}`, sha256: hash, sourceBounds: element.sourceBounds, sheetBounds: { space: 'sheet-pixels' as const, x: 0, y: 0, width: 90, height: 90 }, provenanceId: `prov.${element.id}` })) }
    })
    const deps = { proposer: { propose: async () => proposal }, reviewer: { review: async ({ proposal }: { proposal: VisualDecompositionProposal }) => ({ version: 'visual-decomposition-review.v1' as const, reviewId: 'review.1', proposalId: proposal.proposalId, taskId: proposal.taskId, status: 'approved' as const, reviewedElements: proposal.elements, evidence: ['checked'], reviewedAt: 2 }) }, applicator: { apply }, store, append: vi.fn(), now: () => 3 }
    const plan = await planVisualDecomposition(task())
    await expect(executeVisualDecomposition('run.1', plan, deps)).rejects.toThrow('temporary')
    fail = false
    const resumed = await executeVisualDecomposition('run.2', plan, deps)
    const cached = await executeVisualDecomposition('run.3', plan, deps)
    expect(apply.mock.calls.filter(([input]) => input.batchKey === 'flat:control')).toHaveLength(1)
    expect(resumed.idempotent).toBe(false); expect(cached.idempotent).toBe(true)
  })

  it('cancels before further deterministic work', async () => {
    const controller = new AbortController(); controller.abort()
    await expect(executeVisualDecomposition('run.1', await planVisualDecomposition(task()), { proposer: { propose: vi.fn() }, reviewer: { review: vi.fn() }, applicator: { apply: vi.fn() }, store: createMemoryVisualDecompositionStore(), append: vi.fn(), signal: controller.signal })).rejects.toThrow(/cancelled/)
  })
})
