import { Boxes, Database, FileCode2, Layers3, PackageCheck, Puzzle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type DesignOsCapabilityStatus = 'available' | 'unavailable' | 'planned' | 'unknown'

export interface DesignOsCapability {
  readonly id: string
  readonly label: string
  readonly status: DesignOsCapabilityStatus
  readonly detail?: string
}

/** Read-only projection of the canonical Design IR for any host surface. */
export interface DesignOsPanelModel {
  readonly documentId: string
  readonly revisionId: string
  readonly revisionNumber: number
  readonly counts: {
    readonly sources: number
    readonly tokens: number
    readonly components: number
    readonly materials: number
  }
  readonly capabilities: readonly DesignOsCapability[]
}

export interface DesignOsPanelProps {
  readonly model: DesignOsPanelModel
  readonly className?: string
}

const CAPABILITY_LABELS: Record<DesignOsCapabilityStatus, string> = {
  available: 'Available',
  unavailable: 'Unavailable',
  planned: 'Planned',
  unknown: 'Unknown',
}

const CAPABILITY_STYLES: Record<DesignOsCapabilityStatus, string> = {
  available: 'border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  unavailable: 'border-transparent bg-muted text-muted-foreground',
  planned: 'border-transparent bg-amber-500/10 text-amber-700 dark:text-amber-300',
  unknown: 'border-transparent bg-muted text-muted-foreground',
}

export function DesignOsPanel({ model, className }: DesignOsPanelProps) {
  return (
    <section
      aria-label="System summary"
      data-slot="design-os-panel"
      className={cn('overflow-hidden rounded-lg border border-border bg-background text-foreground', className)}
    >
      <header className="border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Boxes aria-hidden="true" className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">System summary</h2>
        </div>
        <p
          className="mt-0.5 text-xs text-muted-foreground"
          title={`${model.documentId} · ${model.revisionId}`}
        >
          Revision {model.revisionNumber}
        </p>
      </header>

      <dl data-slot="design-os-counts" className="grid grid-cols-2 divide-x divide-y divide-border border-b border-border">
        <Count icon={Database} label="Sources" value={model.counts.sources} />
        <Count icon={Layers3} label="Tokens" value={model.counts.tokens} />
        <Count icon={Puzzle} label="Components" value={model.counts.components} />
        <Count icon={PackageCheck} label="Materials" value={model.counts.materials} />
      </dl>

      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <FileCode2 aria-hidden="true" className="size-3.5 text-muted-foreground" />
          <h3 className="text-xs font-medium text-muted-foreground">Capabilities</h3>
        </div>
        {model.capabilities.length > 0 ? (
          <ul data-slot="design-os-capabilities" className="mt-2 divide-y divide-border">
            {model.capabilities.map((capability) => (
              <li key={capability.id} className="flex min-w-0 items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{capability.label}</p>
                  {capability.detail ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{capability.detail}</p> : null}
                </div>
                <Badge className={cn('shrink-0', CAPABILITY_STYLES[capability.status])}>
                  {CAPABILITY_LABELS[capability.status]}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p data-slot="design-os-empty-capabilities" className="mt-2 text-xs text-muted-foreground">No capabilities declared.</p>
        )}
      </div>
    </section>
  )
}

function Count({
  icon: Icon,
  label,
  value,
}: {
  readonly icon: typeof Database
  readonly label: string
  readonly value: number
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 px-3 py-2.5">
      <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-[11px] text-muted-foreground">{label}</dt>
        <dd className="text-sm font-semibold tabular-nums">{value}</dd>
      </div>
    </div>
  )
}
