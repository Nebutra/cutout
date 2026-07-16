import { z } from 'zod'
import { createRunEvent, type AgentRunEvent } from '@/agent-runtime/run-events'

const id = z.string().min(1).max(160)
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i)
const bounds = <Space extends 'source-pixels' | 'sheet-pixels'>(space: Space) => z.object({ space: z.literal(space), x: z.number().int().nonnegative(), y: z.number().int().nonnegative(), width: z.number().int().positive(), height: z.number().int().positive() }).strict()
export const sourcePixelBoundsSchema = bounds('source-pixels')
export const sheetPixelBoundsSchema = bounds('sheet-pixels')
export type SourcePixelBounds = z.infer<typeof sourcePixelBoundsSchema>
export type SheetPixelBounds = z.infer<typeof sheetPixelBoundsSchema>

export const visualDecompositionTaskSchema = z.object({
  version: z.literal('visual-decomposition-task.v1'), taskId: id,
  source: z.object({ artifactId: id, sha256, mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp']), width: z.number().int().positive(), height: z.number().int().positive(), provenanceId: id }).strict(),
  batching: z.object({ maximumItems: z.number().int().min(1).max(24).default(12), concurrency: z.number().int().min(1).max(8).default(3) }).strict().default({ maximumItems: 12, concurrency: 3 }),
  retry: z.object({ maximumAttempts: z.number().int().min(1).max(4).default(2) }).strict().default({ maximumAttempts: 2 }),
}).strict()
export type VisualDecompositionTask = z.infer<typeof visualDecompositionTaskSchema>

export const decompositionElementSchema = z.object({ id, name: z.string().min(1).max(240), semantic: z.string().min(1).max(80), style: z.string().min(1).max(80), sourceBounds: sourcePixelBoundsSchema, include: z.boolean() }).strict()
export type DecompositionElement = z.infer<typeof decompositionElementSchema>
export const visualDecompositionProposalSchema = z.object({ version: z.literal('visual-decomposition-proposal.v1'), proposalId: id, taskId: id, sourceSha256: sha256, elements: z.array(decompositionElementSchema).min(1).max(500), provenanceIds: z.array(id).min(1), proposedAt: z.number().int().nonnegative() }).strict()
export type VisualDecompositionProposal = z.infer<typeof visualDecompositionProposalSchema>
export const visualDecompositionReviewSchema = z.object({ version: z.literal('visual-decomposition-review.v1'), reviewId: id, proposalId: id, taskId: id, status: z.enum(['approved', 'rejected']), reviewedElements: z.array(decompositionElementSchema).min(1).max(500), evidence: z.array(z.string().min(1).max(2_000)).min(1), reviewedAt: z.number().int().nonnegative() }).strict()
export type VisualDecompositionReview = z.infer<typeof visualDecompositionReviewSchema>

export const decompositionAssetSchema = z.object({ elementId: id, artifactId: id, sha256, sourceBounds: sourcePixelBoundsSchema, sheetBounds: sheetPixelBoundsSchema, provenanceId: id }).strict()
export type DecompositionAsset = z.infer<typeof decompositionAssetSchema>
const applyResultSchema = z.object({ sheetArtifactId: id, sheetSha256: sha256, width: z.number().int().positive(), height: z.number().int().positive(), assets: z.array(decompositionAssetSchema).min(1) }).strict()
export type VisualDecompositionApplyResult = z.infer<typeof applyResultSchema>

export const visualDecompositionReceiptSchema = z.object({ version: z.literal('visual-decomposition-receipt.v1'), receiptId: id, runId: id, taskId: id, inputHash: sha256, proposalId: id, reviewId: id, sourceArtifactId: id, sourceSha256: sha256, status: z.literal('succeeded'), batchReceipts: z.array(z.object({ batchKey: id, inputHash: sha256, sheetArtifactId: id, sheetSha256: sha256, elementIds: z.array(id).min(1) }).strict()).min(1), assets: z.array(decompositionAssetSchema).min(1), provenanceIds: z.array(id).min(1), completedAt: z.number().int().nonnegative() }).strict()
export type VisualDecompositionReceipt = z.infer<typeof visualDecompositionReceiptSchema>

export interface VisualDecompositionPlan { readonly version: 'visual-decomposition-plan.v1'; readonly planId: string; readonly task: VisualDecompositionTask; readonly inputHash: string; readonly nodes: readonly { readonly id: string; readonly operation: 'propose' | 'review' | 'apply'; readonly inputs: readonly string[] }[] }
export interface ReviewedElementBatch { readonly batchKey: string; readonly elements: readonly DecompositionElement[] }

export async function planVisualDecomposition(input: VisualDecompositionTask): Promise<VisualDecompositionPlan> {
  const task = visualDecompositionTaskSchema.parse(input), inputHash = await hashJson(task)
  const propose = `${task.taskId}:propose`, review = `${task.taskId}:review`, apply = `${task.taskId}:apply`
  return { version: 'visual-decomposition-plan.v1', planId: `visual-decomposition:${task.taskId}:${inputHash.slice(0, 16)}`, task, inputHash, nodes: [{ id: propose, operation: 'propose', inputs: [] }, { id: review, operation: 'review', inputs: [propose] }, { id: apply, operation: 'apply', inputs: [review] }] }
}

export function groupReviewedElements(elements: readonly DecompositionElement[], maximumItems: number): readonly ReviewedElementBatch[] {
  const included = elements.filter((element) => element.include).sort((a, b) => `${a.style}:${a.semantic}:${a.id}`.localeCompare(`${b.style}:${b.semantic}:${b.id}`))
  const groups = new Map<string, DecompositionElement[]>()
  for (const element of included) { const key = `${element.style}:${element.semantic}`; groups.set(key, [...(groups.get(key) ?? []), element]) }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([key, values]) => Array.from({ length: Math.ceil(values.length / maximumItems) }, (_, index) => ({ batchKey: values.length > maximumItems ? `${key}:${index + 1}` : key, elements: values.slice(index * maximumItems, (index + 1) * maximumItems) })))
}

export interface VisualDecompositionStore {
  getResult(inputHash: string): VisualDecompositionExecutionResult | undefined; putResult(inputHash: string, result: VisualDecompositionExecutionResult): void
  getProposal(inputHash: string): VisualDecompositionProposal | undefined; putProposal(inputHash: string, proposal: VisualDecompositionProposal): void
  getReview(inputHash: string): VisualDecompositionReview | undefined; putReview(inputHash: string, review: VisualDecompositionReview): void
  getBatch(inputHash: string): VisualDecompositionApplyResult | undefined; putBatch(inputHash: string, result: VisualDecompositionApplyResult): void
}
export interface VisualDecompositionExecutionResult { readonly planId: string; readonly proposal: VisualDecompositionProposal; readonly review: VisualDecompositionReview; readonly receipt: VisualDecompositionReceipt; readonly idempotent: boolean }
export interface VisualDecompositionDeps {
  readonly proposer: { propose(input: { task: VisualDecompositionTask; inputHash: string; signal?: AbortSignal }): Promise<VisualDecompositionProposal> }
  readonly reviewer: { review(input: { task: VisualDecompositionTask; proposal: VisualDecompositionProposal; signal?: AbortSignal }): Promise<VisualDecompositionReview> }
  /** Deterministic host operation: crop/key/matte only. It must not invoke a model. */
  readonly applicator: { apply(input: { task: VisualDecompositionTask; reviewId: string; batchKey: string; batchInputHash: string; elements: readonly DecompositionElement[]; signal?: AbortSignal }): Promise<VisualDecompositionApplyResult> }
  readonly store: VisualDecompositionStore; readonly append: (events: readonly AgentRunEvent[]) => void; readonly now?: () => number; readonly signal?: AbortSignal
}

export async function executeVisualDecomposition(runId: string, plan: VisualDecompositionPlan, deps: VisualDecompositionDeps): Promise<VisualDecompositionExecutionResult> {
  const task = visualDecompositionTaskSchema.parse(plan.task), expectedHash = await hashJson(task)
  if (expectedHash !== plan.inputHash) throw new Error('Visual decomposition plan input hash does not match its task.')
  const prior = deps.store.getResult(plan.inputHash); if (prior) return { ...prior, idempotent: true }
  const now = deps.now ?? Date.now; assertActive(deps.signal)
  deps.append([createRunEvent(runId, { type: 'step-started', stepId: plan.planId, label: `Visual decomposition: ${task.source.artifactId}` }, { eventId: `event:${plan.planId}:started`, at: now() })])
  try {
    const proposal = deps.store.getProposal(plan.inputHash) ?? await retry(task.retry.maximumAttempts, deps.signal, () => deps.proposer.propose({ task, inputHash: plan.inputHash, signal: deps.signal }))
    validateProposal(task, proposal); deps.store.putProposal(plan.inputHash, proposal)
    const review = deps.store.getReview(plan.inputHash) ?? await deps.reviewer.review({ task, proposal, signal: deps.signal })
    validateReview(task, proposal, review); deps.store.putReview(plan.inputHash, review)
    if (review.status !== 'approved') throw new Error('Visual decomposition requires an approved review artifact before apply.')
    const batches = groupReviewedElements(review.reviewedElements, task.batching.maximumItems); if (!batches.length) throw new Error('Approved visual decomposition review contains no included elements.')
    const applied = await mapConcurrent(batches, task.batching.concurrency, deps.signal, async (batch) => {
      const batchInputHash = await hashJson({ sourceSha256: task.source.sha256, reviewId: review.reviewId, batchKey: batch.batchKey, elements: batch.elements })
      const cached = deps.store.getBatch(batchInputHash); if (cached) return { batch, batchInputHash, result: cached }
      const result = await retry(task.retry.maximumAttempts, deps.signal, () => deps.applicator.apply({ task, reviewId: review.reviewId, batchKey: batch.batchKey, batchInputHash, elements: batch.elements, signal: deps.signal }))
      validateApply(batch, result); deps.store.putBatch(batchInputHash, result); return { batch, batchInputHash, result }
    })
    const assets = applied.flatMap(({ result }) => result.assets)
    const receipt = visualDecompositionReceiptSchema.parse({ version: 'visual-decomposition-receipt.v1', receiptId: `visual-decomposition-receipt:${plan.inputHash}`, runId, taskId: task.taskId, inputHash: plan.inputHash, proposalId: proposal.proposalId, reviewId: review.reviewId, sourceArtifactId: task.source.artifactId, sourceSha256: task.source.sha256, status: 'succeeded', batchReceipts: applied.map(({ batch, batchInputHash, result }) => ({ batchKey: batch.batchKey, inputHash: batchInputHash, sheetArtifactId: result.sheetArtifactId, sheetSha256: result.sheetSha256, elementIds: batch.elements.map(({ id }) => id) })), assets, provenanceIds: [...new Set([task.source.provenanceId, ...proposal.provenanceIds, ...assets.map(({ provenanceId }) => provenanceId)])], completedAt: now() })
    const result = { planId: plan.planId, proposal, review, receipt, idempotent: false } satisfies VisualDecompositionExecutionResult
    deps.store.putResult(plan.inputHash, result); deps.append([createRunEvent(runId, { type: 'step-succeeded', stepId: plan.planId, label: `Visual decomposition: ${task.source.artifactId}`, detail: `${assets.length} reviewed assets` }, { eventId: `event:${plan.planId}:succeeded`, at: now() })]); return result
  } catch (error) { const detail = error instanceof Error ? error.message : String(error); deps.append([createRunEvent(runId, { type: deps.signal?.aborted ? 'step-cancelled' : 'step-failed', stepId: plan.planId, label: `Visual decomposition: ${task.source.artifactId}`, detail }, { eventId: `event:${plan.planId}:failed`, at: now() })]); throw error }
}

function validateProposal(task: VisualDecompositionTask, input: unknown): asserts input is VisualDecompositionProposal { const proposal = visualDecompositionProposalSchema.parse(input); if (proposal.taskId !== task.taskId || proposal.sourceSha256 !== task.source.sha256) throw new Error('Visual proposal is not bound to this task source.'); if (new Set(proposal.elements.map(({ id }) => id)).size !== proposal.elements.length) throw new Error('Visual proposal element ids must be unique.'); for (const element of proposal.elements) assertInside(element.sourceBounds, task.source.width, task.source.height, `proposal element ${element.id}`) }
function validateReview(task: VisualDecompositionTask, proposal: VisualDecompositionProposal, input: unknown): asserts input is VisualDecompositionReview { const review = visualDecompositionReviewSchema.parse(input); if (review.taskId !== proposal.taskId || review.proposalId !== proposal.proposalId) throw new Error('Visual review is not bound to this proposal.'); if (new Set(review.reviewedElements.map(({ id }) => id)).size !== review.reviewedElements.length) throw new Error('Visual review element ids must be unique.'); for (const element of review.reviewedElements) assertInside(element.sourceBounds, task.source.width, task.source.height, `reviewed element ${element.id}`) }
function validateApply(batch: ReviewedElementBatch, input: unknown): asserts input is VisualDecompositionApplyResult { const result = applyResultSchema.parse(input), expected = new Map(batch.elements.map((element) => [element.id, element])); if (result.assets.length !== expected.size) throw new Error(`Deterministic apply for ${batch.batchKey} did not return every reviewed element.`); for (const asset of result.assets) { const element = expected.get(asset.elementId); if (!element || JSON.stringify(element.sourceBounds) !== JSON.stringify(asset.sourceBounds)) throw new Error(`Deterministic apply changed reviewed source coordinates for ${asset.elementId}.`); assertInside(asset.sheetBounds, result.width, result.height, `sheet asset ${asset.elementId}`); expected.delete(asset.elementId) } }
function assertInside(value: SourcePixelBounds | SheetPixelBounds, width: number, height: number, label: string) { if (value.x + value.width > width || value.y + value.height > height) throw new Error(`${label} exceeds its declared coordinate space.`) }
async function retry<T>(attempts: number, signal: AbortSignal | undefined, work: () => Promise<T>): Promise<T> { let last: unknown; for (let attempt = 1; attempt <= attempts; attempt++) { assertActive(signal); try { return await work() } catch (error) { last = error; if (signal?.aborted) throw error } } throw last instanceof Error ? last : new Error(String(last)) }
async function mapConcurrent<I, O>(items: readonly I[], concurrency: number, signal: AbortSignal | undefined, work: (item: I) => Promise<O>): Promise<O[]> { const output = new Array<O>(items.length); let cursor = 0; await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => { while (true) { assertActive(signal); const index = cursor++; if (index >= items.length) return; output[index] = await work(items[index]!) } })); return output }
function assertActive(signal?: AbortSignal) { if (signal?.aborted) throw new DOMException('Visual decomposition cancelled.', 'AbortError') }
async function hashJson(value: unknown): Promise<string> { const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value))); return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('') }
function canonicalJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`; if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`; return JSON.stringify(value) }

export function createMemoryVisualDecompositionStore(): VisualDecompositionStore { const results = new Map<string, VisualDecompositionExecutionResult>(), proposals = new Map<string, VisualDecompositionProposal>(), reviews = new Map<string, VisualDecompositionReview>(), batches = new Map<string, VisualDecompositionApplyResult>(); return { getResult: (key) => results.get(key), putResult: (key, value) => { results.set(key, value) }, getProposal: (key) => proposals.get(key), putProposal: (key, value) => { proposals.set(key, value) }, getReview: (key) => reviews.get(key), putReview: (key, value) => { reviews.set(key, value) }, getBatch: (key) => batches.get(key), putBatch: (key, value) => { batches.set(key, value) } } }

interface StoredDecompositionState { readonly version: 'visual-decomposition-store.v1'; readonly results: Record<string, VisualDecompositionExecutionResult>; readonly proposals: Record<string, VisualDecompositionProposal>; readonly reviews: Record<string, VisualDecompositionReview>; readonly batches: Record<string, VisualDecompositionApplyResult> }
export function createStorageVisualDecompositionStore(storage: Pick<Storage, 'getItem' | 'setItem'>, key = 'cutout.visual-decomposition.v1'): VisualDecompositionStore {
  const empty = (): StoredDecompositionState => ({ version: 'visual-decomposition-store.v1', results: {}, proposals: {}, reviews: {}, batches: {} })
  const read = () => { const raw = storage.getItem(key); if (!raw) return empty(); const value = JSON.parse(raw) as StoredDecompositionState; if (value.version !== 'visual-decomposition-store.v1' || !value.results || !value.proposals || !value.reviews || !value.batches) throw new Error('Stored visual decomposition checkpoint is invalid.'); return value }
  const update = (change: (state: StoredDecompositionState) => StoredDecompositionState) => storage.setItem(key, JSON.stringify(change(read())))
  return { getResult: (id) => read().results[id], putResult: (id, value) => update((state) => ({ ...state, results: { ...state.results, [id]: value } })), getProposal: (id) => read().proposals[id], putProposal: (id, value) => update((state) => ({ ...state, proposals: { ...state.proposals, [id]: value } })), getReview: (id) => read().reviews[id], putReview: (id, value) => update((state) => ({ ...state, reviews: { ...state.reviews, [id]: value } })), getBatch: (id) => read().batches[id], putBatch: (id, value) => update((state) => ({ ...state, batches: { ...state.batches, [id]: value } })) }
}
