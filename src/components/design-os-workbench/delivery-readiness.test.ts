import { describe, expect, it } from 'vitest'
import { projectDeliveryReadiness } from './delivery-readiness'
import type { DeliveryCenterViewModel } from './DeliveryCenterPanel'

const model: DeliveryCenterViewModel = { targets: [
  { id: 'design', kind: 'design-system', label: 'Design System Kit', destinationLabel: 'Local', available: true },
  { id: 'brand', kind: 'brand-kit', label: 'Brand VI Kit', destinationLabel: 'Local', available: false, unavailableReason: 'Manifest missing' },
  { id: 'registry', kind: 'registry', label: 'Source registry', destinationLabel: 'Repository', available: false, unavailableReason: 'Host missing' },
  { id: 'github', kind: 'github', label: 'GitHub', destinationLabel: 'PR', available: false, unavailableReason: 'Authorization required' },
  { id: 'notion', kind: 'notion', label: 'Notion', destinationLabel: 'Page', available: false, unavailableReason: 'Session missing' },
] }

describe('delivery readiness projection', () => {
  it('separates deliverables from destinations and recommends only a real available destination', () => {
    const result = projectDeliveryReadiness(model)
    expect(result.deliverables.map((item) => item.kind)).toEqual(['design-kit', 'brand-kit', 'source-registry'])
    expect(result.destinations).toEqual([{ id: 'destination:local-folder', kind: 'local-folder', label: 'Local folder', available: true, targetIds: ['design'] }])
    expect(result.recommendedDestination).toBe('destination:local-folder')
    expect(result.selectedDeliverables).toEqual(['design'])
  })

  it('puts unavailable remotes behind Add destination and raw errors in advanced evidence', () => {
    const result = projectDeliveryReadiness(model)
    expect(result.addDestinations.map((item) => item.kind)).toEqual(['repository', 'github', 'notion'])
    expect(JSON.stringify(result.advancedEvidence)).toContain('Authorization required')
    expect(result.destinations.some((item) => item.kind === 'github')).toBe(false)
  })

  it('projects prepare, connect, preview, then approval-gated deliver without inventing receipts', () => {
    expect(projectDeliveryReadiness({ targets: model.targets.map((target) => ({ ...target, available: false })) }).nextAction.kind).toBe('prepare')
    expect(projectDeliveryReadiness({ targets: [{ ...model.targets[0]!, available: false }] }, ['design']).nextAction.kind).toBe('prepare')
    expect(projectDeliveryReadiness(model).nextAction.kind).toBe('preview')
    const withPlan = { ...model, plan: { id: 'plan:1' } as DeliveryCenterViewModel['plan'] }
    expect(projectDeliveryReadiness(withPlan).nextAction.kind).toBe('deliver')
    expect(projectDeliveryReadiness(withPlan).nextAction.targetIds).toEqual(['design'])
  })

  it('projects an explicit connected destination to its runtime target id', () => {
    const connected = { ...model, targets: model.targets.map((target) => target.id === 'github' ? { ...target, available: true } : target) }
    const result = projectDeliveryReadiness(connected, ['design'], 'github')
    expect(result.selectedDestination).toBe('github')
    expect(result.nextAction).toMatchObject({ kind: 'preview', targetIds: ['github'] })
  })
})
