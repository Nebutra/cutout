import type { DeliveryCenterViewModel, DeliveryTargetOption } from './DeliveryCenterPanel'

export type DeliverableKind = 'design-kit' | 'brand-kit' | 'starter' | 'source-registry'
export type DestinationKind = 'local-folder' | 'repository' | 'github' | 'notion'
export type DeliveryNextAction = 'prepare' | 'connect' | 'preview' | 'deliver'

export interface DeliveryReadinessProjection {
  readonly deliverables: readonly { readonly id: string; readonly kind: DeliverableKind; readonly label: string; readonly detail: string; readonly ready: boolean; readonly unavailableReason?: string }[]
  readonly destinations: readonly { readonly id: string; readonly kind: DestinationKind; readonly label: string; readonly available: boolean; readonly targetIds: readonly string[] }[]
  readonly addDestinations: readonly { readonly id: string; readonly kind: DestinationKind; readonly label: string }[]
  readonly selectedDeliverables: readonly string[]
  readonly recommendedDestination?: string
  readonly selectedDestination?: string
  readonly readiness: 'ready' | 'blocked'
  readonly checklist: readonly { readonly id: string; readonly label: string; readonly complete: boolean }[]
  readonly nextAction: { readonly kind: DeliveryNextAction; readonly label: string; readonly targetIds: readonly string[] }
  readonly advancedEvidence: unknown
}

const deliverableKind = (target: DeliveryTargetOption): DeliverableKind | undefined => target.kind === 'design-system' ? 'design-kit' : target.kind === 'brand-kit' ? 'brand-kit' : target.kind === 'starter' ? 'starter' : target.kind === 'registry' ? 'source-registry' : undefined
const destinationKind = (target: DeliveryTargetOption): DestinationKind | undefined => target.kind === 'github' ? 'github' : target.kind === 'notion' ? 'notion' : target.kind === 'registry' ? 'repository' : undefined
const detail: Record<DeliverableKind, string> = { 'design-kit': 'Tokens, components and implementation guidance', 'brand-kit': 'Identity system and approved visual assets', starter: 'Runnable application project and source files', 'source-registry': 'Approved assets or registry-ready source' }

export function projectDeliveryReadiness(model: DeliveryCenterViewModel, selected?: readonly string[], destinationId?: string): DeliveryReadinessProjection {
  const deliverables = model.targets.flatMap((target) => { const kind = deliverableKind(target); return kind ? [{ id: target.id, kind, label: target.label, detail: detail[kind], ready: target.available, ...(target.unavailableReason ? { unavailableReason: target.unavailableReason } : {}) }] : [] })
  const selectedDeliverables = [...new Set((selected ?? deliverables.filter((item) => item.ready).slice(0, 1).map((item) => item.id)).filter((id) => deliverables.some((item) => item.id === id && item.ready)))]
  const localAvailable = selectedDeliverables.length > 0
  const declaredDestinations = model.targets.flatMap((target) => { const kind = destinationKind(target); return kind ? [{ id: target.id, kind, label: target.destinationLabel, available: target.available, targetIds: [target.id] }] : [] })
  const allDestinations = [{ id: 'destination:local-folder', kind: 'local-folder' as const, label: 'Local folder', available: localAvailable, targetIds: selectedDeliverables }, ...declaredDestinations]
  const destinations = allDestinations.filter((destination) => destination.available)
  const recommendedDestination = destinations.find((destination) => destination.kind === 'local-folder')?.id ?? destinations[0]?.id
  const selectedDestination = destinations.some((destination) => destination.id === destinationId) ? destinationId : recommendedDestination
  const targetIds = destinations.find((destination) => destination.id === selectedDestination)?.targetIds ?? []
  const governanceBlocked = model.governance?.receipt.status === 'blocked'
  const checklist = [
    { id: 'deliverables', label: 'Deliverable is approved and versioned.', complete: selectedDeliverables.length > 0 },
    { id: 'destination', label: 'Destination is available.', complete: Boolean(selectedDestination) },
    { id: 'governance', label: governanceBlocked ? 'Design checks need attention.' : 'Required design checks passed.', complete: !governanceBlocked },
  ]
  const kind: DeliveryNextAction = selectedDeliverables.length === 0 || governanceBlocked ? 'prepare' : !selectedDestination ? 'connect' : model.plan ? 'deliver' : 'preview'
  return {
    deliverables,
    destinations,
    addDestinations: allDestinations.filter((destination) => !destination.available).map(({ id, kind, label }) => ({ id, kind, label })),
    selectedDeliverables,
    recommendedDestination,
    selectedDestination,
    readiness: kind === 'deliver' ? 'ready' : 'blocked',
    checklist,
    nextAction: { kind, label: { prepare: 'Ask Agent to prepare deliverables', connect: 'Add destination', preview: 'Preview delivery', deliver: 'Approve and deliver' }[kind], targetIds },
    advancedEvidence: { plan: model.plan ?? null, receipt: model.receipt ?? null, unavailable: model.targets.filter((target) => !target.available).map(({ id, kind, unavailableReason }) => ({ id, kind, error: unavailableReason })) },
  }
}
