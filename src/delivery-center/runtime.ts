import { compositeDeliveryReceiptSchema, deliveryPlanSchema, deliveryRequestSchema, targetExecutionReceiptSchema, type CompositeDeliveryReceipt, type DeliveryPlan, type DeliveryRequest, type DeliveryTargetKind, type TargetExecutionReceipt, type TargetPreview } from './contracts'
import { publishDeliveryNotification } from '@/services/local/local-notifications'

export interface DeliveryExecutor {
  readonly kind: DeliveryTargetKind
  preview(target: DeliveryRequest['targets'][number], request: DeliveryRequest, signal: AbortSignal): Promise<TargetPreview>
  execute(target: DeliveryRequest['targets'][number], context: { readonly request: DeliveryRequest; readonly plan: DeliveryPlan; readonly approvalId: string; readonly dependencyReceipts: readonly TargetExecutionReceipt[]; readonly signal: AbortSignal }): Promise<TargetExecutionReceipt>
}
export class UnifiedDeliveryCenter {
  readonly #executors = new Map<DeliveryTargetKind, DeliveryExecutor>()
  readonly #plans = new Map<string, { request: DeliveryRequest; plan: DeliveryPlan }>()
  readonly now: () => string
  constructor(executors: readonly DeliveryExecutor[], now: () => string = () => new Date().toISOString()) { this.now = now; for (const executor of executors) { if (this.#executors.has(executor.kind)) throw new Error(`Duplicate delivery executor: ${executor.kind}.`); this.#executors.set(executor.kind, executor) } }

  async preview(input: unknown, signal = new AbortController().signal): Promise<DeliveryPlan> {
    const request = deliveryRequestSchema.parse(input); const targets: TargetPreview[] = []
    for (const target of topological(request)) { signal.throwIfAborted(); const executor = this.#executors.get(target.kind); const preview = executor ? await executor.preview(target, request, signal) : { targetId: target.id, kind: target.kind, destination: target.destination, effects: [target.destination.kind === 'external-publish' ? 'external-write' as const : target.destination.kind === 'controlled-repository' ? 'project-files' as const : 'managed-export' as const], estimatedCostUsd: 0, currency: 'USD' as const, files: [], warnings: [`${target.kind} executor is capability-required.`] }; if (preview.targetId !== target.id || preview.kind !== target.kind || JSON.stringify(preview.destination) !== JSON.stringify(target.destination)) throw new Error(`Delivery executor returned a preview for another target: ${target.id}.`); targets.push(preview) }
    const createdAt = this.now(); const id = stableId(request.id, request.designRevision.revisionId, JSON.stringify(targets))
    const plan = deliveryPlanSchema.parse({ protocol: 'cutout.delivery-center.v1', id, requestId: request.id, outcomeId: request.outcomeId, outcomeRevision: request.outcomeRevision, designRevision: request.designRevision, targets, totalEstimatedCostUsd: targets.reduce((sum,target) => sum + target.estimatedCostUsd, 0), currency: 'USD', requiresApproval: true, createdAt })
    this.#plans.set(id, { request, plan }); return plan
  }

  async execute(planId: string, approvalId: string, currentRevision: DeliveryRequest['designRevision'], signal = new AbortController().signal): Promise<CompositeDeliveryReceipt> {
    const prepared = this.#plans.get(planId); if (!prepared) throw new Error('Delivery plan is missing or expired.'); if (!approvalId.trim()) throw new Error('An opaque approval id is required.'); if (JSON.stringify(prepared.request.designRevision) !== JSON.stringify(currentRevision)) throw new Error('Delivery plan targets a stale Design IR revision.')
    const receipts: TargetExecutionReceipt[] = []
    for (const target of topological(prepared.request)) {
      if (signal.aborted) { receipts.push(failure(target, prepared.plan, this.now(), 'cancelled', 'aborted', 'Delivery was cancelled.')); continue }
      const dependencies = target.dependsOn.map((id) => receipts.find((receipt) => receipt.targetId === id)!).filter(Boolean)
      if (dependencies.some((receipt) => receipt.status !== 'succeeded')) { receipts.push(failure(target, prepared.plan, this.now(), 'skipped', 'dependency-failed', 'A required delivery dependency did not succeed.')); continue }
      const executor = this.#executors.get(target.kind)
      if (!executor) { receipts.push(failure(target, prepared.plan, this.now(), 'capability-required', 'capability-required', `${target.kind} executor is unavailable.`)); continue }
      const receipt = targetExecutionReceiptSchema.parse(await executor.execute(target, { request: prepared.request, plan: prepared.plan, approvalId, dependencyReceipts: dependencies, signal }))
      if (receipt.targetId !== target.id || receipt.kind !== target.kind || JSON.stringify(receipt.destination) !== JSON.stringify(target.destination)) throw new Error(`Delivery executor returned a receipt for another target: ${target.id}.`)
      receipts.push(enforceGates(receipt, target.requiredGates))
    }
    const status = receipts.every((receipt) => receipt.status === 'succeeded') ? 'succeeded' : signal.aborted ? 'cancelled' : 'completed-with-failures'
    const receipt = compositeDeliveryReceiptSchema.parse({ protocol: 'cutout.delivery-receipt.v1', id: stableId(planId, approvalId), planId, requestId: prepared.request.id, approvalId, outcome: { id: prepared.request.outcomeId, revision: prepared.request.outcomeRevision }, designRevision: prepared.request.designRevision, status, targets: receipts, artifactHashes: receipts.flatMap((receipt) => receipt.artifacts.map((artifact) => ({ targetId: receipt.targetId, path: artifact.path, sha256: artifact.sha256 }))), completedAt: this.now() })
    publishDeliveryNotification(receipt)
    return receipt
  }
}
function enforceGates(receipt: TargetExecutionReceipt, required: readonly TargetExecutionReceipt['quality'][number]['gate'][]): TargetExecutionReceipt { if (receipt.status !== 'succeeded') return receipt; const missing = required.filter((gate) => !receipt.quality.some((quality) => quality.gate === gate && quality.status === 'passed')); return missing.length ? { ...receipt, status:'failed', error:{ code:'quality-gate-failed', message:`Required quality gates did not pass: ${missing.join(', ')}.` } } : receipt }
function failure(target: DeliveryRequest['targets'][number], _plan: DeliveryPlan, at: string, status: Exclude<TargetExecutionReceipt['status'],'succeeded'>, code: string, message: string): TargetExecutionReceipt { return targetExecutionReceiptSchema.parse({ targetId:target.id, kind:target.kind, status, destination:target.destination, startedAt:at, completedAt:at, artifacts:[], quality:[], kitManifests:[], error:{code,message} }) }
function topological(request: DeliveryRequest) { const result: DeliveryRequest['targets'][number][]=[]; const pending=new Map(request.targets.map((target)=>[target.id,target])); while(pending.size){ const ready=[...pending.values()].filter((target)=>target.dependsOn.every((id)=>result.some((done)=>done.id===id))).sort((a,b)=>a.id.localeCompare(b.id)); if(!ready.length) throw new Error('Delivery target dependency graph contains a cycle.'); for(const target of ready){ result.push(target); pending.delete(target.id) } } return result }
function stableId(...parts:string[]){ let hash=2166136261; for(const char of parts.join('\0')) hash=Math.imul(hash^char.charCodeAt(0),16777619); return `delivery:${(hash>>>0).toString(16).padStart(8,'0')}` }
