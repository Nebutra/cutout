import { describe, expect, it } from 'vitest'
import { deliveryWorkspaceClasses, projectDeliveryWorkspaceUi } from './delivery-workspace-ui'

describe('Deliver workspace UI contract', () => {
  it('uses one workspace mode and one shared subnav for every result surface', () => {
    for (const tab of ['delivery', 'kits', 'components', 'starter'] as const) {
      const view = projectDeliveryWorkspaceUi({ tab, status: 'ready', hasResults: true, actionAvailable: true })
      expect(view.mode).toEqual({ title: 'Deliver', tabs: ['delivery', 'kits', 'components', 'starter'], activeTab: tab })
      expect(view.result.title).not.toBe('Deliver')
    }
  })

  it('keeps result, readiness, and one primary action above implementation evidence', () => {
    const view = projectDeliveryWorkspaceUi({ tab: 'components', status: 'needs-preparation', hasResults: true, actionAvailable: true })
    expect(view).toMatchObject({ result: { title: 'Prepare components' }, readiness: { label: 'Needs preparation', visible: true }, primaryAction: { label: 'Prepare required materials', disabled: false }, advanced: { expanded: false, evidenceOnly: true } })
  })

  it('uses the existing Home and Settings density instead of a new design system', () => {
    expect(deliveryWorkspaceClasses.content).toContain('max-w-5xl')
    expect(deliveryWorkspaceClasses.primaryColumn).toContain('max-w-3xl')
    expect(deliveryWorkspaceClasses.panel).toBe('rounded-lg border border-border bg-background p-3')
    expect(deliveryWorkspaceClasses.empty).toContain('min-h-56')
    expect(deliveryWorkspaceClasses.primaryAction).toBe('w-full sm:w-auto')
  })

  it('projects truthful empty, disabled, running, error, and mobile states', () => {
    expect(projectDeliveryWorkspaceUi({ tab: 'delivery', status: 'ready', hasResults: false, actionAvailable: true, mobile: true })).toMatchObject({ emptyState: { action: 'Prepare with Agent' }, readiness: { visible: false }, density: 'mobile' })
    expect(projectDeliveryWorkspaceUi({ tab: 'starter', status: 'running', hasResults: true, actionAvailable: true }).primaryAction).toMatchObject({ label: 'Working...', disabled: true })
    expect(projectDeliveryWorkspaceUi({ tab: 'kits', status: 'error', hasResults: true, actionAvailable: false })).toMatchObject({ readiness: { tone: 'destructive' }, primaryAction: { disabled: true } })
  })
})
