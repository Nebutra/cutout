import { Component, Frame, Image, Type } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { StructuredPromotion } from '@/structured-authoring'

const TARGETS = [
  { kind: 'frame', label: 'Frame', icon: Frame },
  { kind: 'text', label: 'Text', icon: Type },
  { kind: 'image', label: 'Image', icon: Image },
  { kind: 'component', label: 'Component', icon: Component },
] as const

export function PromotionPanel({ selection, promotion, onPromote }: {
  readonly selection?: StructuredPromotion['selection']
  readonly promotion?: StructuredPromotion
  readonly onPromote?: (kind: StructuredPromotion['kind']) => void
}) {
  if (!selection) return null
  return <section aria-label="Promote selected region" className="border-t border-border p-3">
    <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium">Promote selection</p><Badge variant="outline">User selected</Badge></div>
    <p className="mt-1 text-xs text-muted-foreground">{Math.round(selection.bounds.width)} × {Math.round(selection.bounds.height)} · {selection.materialId}</p>
    <div className="mt-3 grid grid-cols-4 gap-1">
      {TARGETS.map(({ kind, label, icon: Icon }) => <Button key={kind} type="button" size="sm" variant={promotion?.kind === kind ? 'secondary' : 'ghost'} aria-label={`Promote as ${label}`} onClick={() => onPromote?.(kind)}><Icon /> <span className="sr-only sm:not-sr-only">{label}</span></Button>)}
    </div>
    {promotion?.kind === 'component' && promotion.component ? <details className="mt-3 rounded border border-border p-2">
      <summary className="cursor-pointer text-xs font-medium">Component contract</summary>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <Detail label="Evidence" value={`${promotion.selection.materialId} · ${Math.round(promotion.confidence * 100)}% reviewed confidence`} />
        <Detail label="Constraints" value={`${promotion.constraints.horizontal} × ${promotion.constraints.vertical}`} />
        <Detail label="API" value={`${promotion.component.props.length} props · ${promotion.component.variants.length} variants · ${promotion.component.slots.length} slots`} />
        <Detail label="Stories" value={`${promotion.component.states?.length ?? 0} states · ${promotion.component.stories?.length ?? 0} stories`} />
      </dl>
    </details> : null}
  </section>
}
function Detail({ label, value }: { readonly label: string; readonly value: string }) { return <div><dt className="text-muted-foreground">{label}</dt><dd className="mt-0.5 break-words">{value}</dd></div> }
