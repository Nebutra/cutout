export type DeliveryWorkspaceTab = 'delivery' | 'kits' | 'components' | 'starter'
export type DeliveryWorkspaceStatus = 'ready' | 'needs-preparation' | 'running' | 'complete' | 'error'

export const deliveryWorkspaceClasses = {
  modeHeader: 'min-h-12 shrink-0 border-b border-border bg-background/80 px-3 backdrop-blur',
  subnav: 'h-10 min-w-max justify-start',
  content: 'mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-10',
  primaryColumn: 'mx-auto w-full max-w-3xl space-y-5',
  heading: 'text-base font-semibold',
  description: 'mt-1 max-w-xl text-sm leading-6 text-muted-foreground',
  sectionHeading: 'text-sm font-medium',
  sectionDescription: 'mt-1 text-xs text-muted-foreground',
  panel: 'rounded-lg border border-border bg-background p-3',
  selectable: 'rounded-lg border border-border p-3 text-left hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50',
  empty: 'flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background/70 p-6 text-center',
  primaryAction: 'w-full sm:w-auto',
  advanced: 'rounded-lg border border-border bg-muted/20 px-3 py-2.5',
} as const

const copy: Record<DeliveryWorkspaceTab, { title: string; description: string }> = {
  delivery: { title: 'Deliver results', description: 'Choose the approved result and where it should go.' },
  kits: { title: 'Prepare kits', description: 'Package the approved design and brand foundations for use.' },
  components: { title: 'Prepare components', description: 'Turn explicit component declarations into verified reusable outputs.' },
  starter: { title: 'Prepare starter', description: 'Generate the selected application starter from approved materials.' },
}

export interface DeliveryWorkspaceUiInput {
  readonly tab: DeliveryWorkspaceTab
  readonly status: DeliveryWorkspaceStatus
  readonly hasResults: boolean
  readonly actionAvailable: boolean
  readonly mobile?: boolean
  readonly advanced?: boolean
}

export function projectDeliveryWorkspaceUi(input: DeliveryWorkspaceUiInput) {
  const result = copy[input.tab]
  const status = {
    ready: { label: 'Ready', tone: 'secondary' as const, cta: input.tab === 'delivery' ? 'Preview delivery' : 'Preview and export' },
    'needs-preparation': { label: 'Needs preparation', tone: 'outline' as const, cta: 'Prepare required materials' },
    running: { label: 'Working', tone: 'outline' as const, cta: 'Working...' },
    complete: { label: 'Complete', tone: 'secondary' as const, cta: 'View result' },
    error: { label: 'Needs attention', tone: 'destructive' as const, cta: 'Review issue' },
  }[input.status]
  return {
    mode: { title: 'Deliver', tabs: ['delivery', 'kits', 'components', 'starter'] as const, activeTab: input.tab },
    result,
    readiness: { label: status.label, tone: status.tone, visible: input.hasResults },
    primaryAction: { label: status.cta, disabled: !input.actionAvailable || input.status === 'running', className: deliveryWorkspaceClasses.primaryAction },
    emptyState: !input.hasResults ? { title: 'Nothing ready to deliver', description: 'Ask the Agent to prepare the required result.', action: 'Prepare with Agent' } : undefined,
    advanced: { expanded: Boolean(input.advanced), label: 'Advanced', evidenceOnly: true },
    density: input.mobile ? 'mobile' as const : 'desktop' as const,
  }
}
