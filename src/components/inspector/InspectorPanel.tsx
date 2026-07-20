/**
 * InspectorPanel (spec §4c) — details for the selected slice: preview, name,
 * dimensions, export. Empty when nothing is selected.
 */
import { AlertTriangle, MousePointerClick } from 'lucide-react'
import { Trans } from '@lingui/react/macro'
import { useSelectedSlice, useSlices } from '@/store/selectors'
import { SliceThumb } from '@/components/slices/SliceThumb'
import { SliceNameField } from './SliceNameField'
import { SliceDimensions } from './SliceDimensions'
import { ExportBar } from './ExportBar'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { useStore } from '@/store'

export function InspectorPanel() {
  const selected = useSelectedSlice()
  const hasSlices = useSlices().length > 0
  const setIncluded = useStore((state) => state.setSliceIncluded)
  const approveForUse = useStore((state) => state.approveSliceForUse)

  if (!selected) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <MousePointerClick className="size-7 text-muted-foreground/50" />
        <p className="max-w-52 text-xs text-muted-foreground">
          {hasSlices ? (
            <Trans id="inspector.empty_has_slices">
              Select a slice to rename, inspect, and export it.
            </Trans>
          ) : (
            <Trans id="inspector.empty_no_slices">
              Sliced regions and their details will show up here.
            </Trans>
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="grid content-start gap-3 p-3">
      <div className="mx-auto w-40 max-w-full">
        <SliceThumb slice={selected} />
      </div>
      <SliceNameField slice={selected} />
      {selected.readiness === 'needs-review' ? (
        <Button size="sm" onClick={() => approveForUse(selected.id)}>Approve for use</Button>
      ) : (
        <Button size="sm" variant={selected.included ? 'outline' : 'default'} aria-pressed={selected.included} onClick={() => setIncluded(selected.id, !selected.included)}>{selected.included ? 'Exclude from results' : 'Include in results'}</Button>
      )}
      {selected.reviewIssues.length > 0 || (selected.confidence !== null && selected.confidence < 0.75) ? <div role="status" className="flex gap-2 border-y border-border py-2 text-xs text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 size-3.5 shrink-0"/><div><p className="font-medium">Needs review</p><p>{selected.reviewIssues[0] ?? `Low confidence (${Math.round(selected.confidence! * 100)}%)`}</p></div></div> : null}
      <Separator />
      <SliceDimensions slice={selected} />
      <Separator />
      <ExportBar slice={selected} />
      <details className="border-t border-border pt-2 text-xs text-muted-foreground"><summary className="cursor-pointer select-none font-medium text-foreground">Details</summary><dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1"><dt>Source region</dt><dd className="truncate text-right">{selected.regionId ?? 'Whole source'}</dd><dt>Page</dt><dd className="truncate text-right">{selected.pageId ?? 'Current'}</dd><dt>Confidence</dt><dd className="text-right">{selected.confidence === null ? 'Not reported' : `${Math.round(selected.confidence * 100)}%`}</dd></dl></details>
    </div>
  )
}
