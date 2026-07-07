/**
 * SliceCard (spec §4c) — one slice: thumb, name, dims, hover actions.
 *
 * Click selects (bbox overlays on the preview). Double-click jumps straight to
 * rename. The selected card gets a ring so the grid↔preview link is obvious.
 */
import { useStore } from '@/store'
import { cn } from '@/lib/utils'
import { requestRename } from '@/hooks/useRenameIntent'
import { SliceThumb } from './SliceThumb'
import { SliceCardActions } from './SliceCardActions'
import type { Slice } from '@/store/types'

export interface SliceCardProps {
  readonly slice: Slice
}

export function SliceCard({ slice }: SliceCardProps) {
  const selectSlice = useStore((s) => s.selectSlice)

  return (
    <div
      role="option"
      aria-selected={slice.selected}
      tabIndex={0}
      data-slice-id={slice.id}
      onClick={() => selectSlice(slice.id)}
      onDoubleClick={() => {
        selectSlice(slice.id)
        requestRename(slice.id)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          selectSlice(slice.id)
        }
      }}
      className={cn(
        'group/card relative cursor-pointer overflow-hidden rounded-lg border border-border/60 bg-card p-1.5 transition-all outline-none',
        'hover:border-ring/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40',
        slice.selected &&
          'border-primary/60 ring-2 ring-primary/40 ring-offset-1 ring-offset-background',
      )}
    >
      <SliceThumb slice={slice} />
      <div className="mt-1 grid gap-0.5 px-0.5">
        <p className="truncate text-xs font-medium" title={slice.name}>
          {slice.name}
        </p>
        <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {slice.width}×{slice.height}
        </p>
      </div>
      <SliceCardActions slice={slice} />
    </div>
  )
}
