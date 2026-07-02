/**
 * DropZone (spec §4c / §6 step 1) — drag-drop + click-to-pick import surface.
 *
 * Shown full-pane when no source is loaded; once a sheet is in, it collapses to
 * a slim "replace" affordance rendered by SourcePanel. Uses the shared
 * `useImageImport` so decode + error policy matches the TopBar button and ⌘O.
 *
 * NOTE: this is the DOM-level drop handler (web + dev). In the packaged desktop
 * build the Tauri window drop event is the source of truth (spec risk #8); that
 * wiring lives in the platform layer, not here.
 */
import { useCallback, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn } from '@/lib/utils'
import { useImageImport } from '@/hooks/useImageImport'

export interface DropZoneProps {
  /** `full` = empty-state hero; `compact` = slim replace bar under a loaded source. */
  readonly variant?: 'full' | 'compact'
}

export function DropZone({ variant = 'full' }: DropZoneProps) {
  const { t } = useLingui()
  const { importFile, openPicker, inputProps } = useImageImport()
  const [dragging, setDragging] = useState(false)

  const onDrop = useCallback(
    (event: React.DragEvent): void => {
      event.preventDefault()
      setDragging(false)
      const file = event.dataTransfer.files?.[0]
      if (file) void importFile(file)
    },
    [importFile],
  )

  const onDragOver = useCallback((event: React.DragEvent): void => {
    event.preventDefault()
    setDragging(true)
  }, [])

  const onDragLeave = useCallback((event: React.DragEvent): void => {
    // Only clear when leaving the zone itself, not a child.
    if (event.currentTarget === event.target) setDragging(false)
  }, [])

  const compact = variant === 'compact'

  return (
    <button
      type="button"
      onClick={openPicker}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      aria-label={t({
        id: 'source.dropzone_aria',
        message: 'Import image — drop a file or click to browse',
      })}
      className={cn(
        'group flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-muted-foreground transition-colors outline-none',
        'hover:border-ring/60 hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        dragging && 'border-primary/70 bg-primary/5 text-foreground',
        compact ? 'px-3 py-2' : 'min-h-56 flex-1 px-6 py-10',
      )}
    >
      <ImagePlus className={compact ? 'size-4' : 'size-7 opacity-70'} />
      <span className={cn('text-center', compact ? 'text-xs' : 'text-sm')}>
        {compact ? (
          <Trans id="source.dropzone_replace">Drop or click to replace</Trans>
        ) : (
          <>
            <span className="font-medium text-foreground">
              <Trans id="source.dropzone_title">Drop an asset sheet</Trans>
            </span>
            <br />
            <span className="text-xs">
              <Trans id="source.dropzone_hint">
                or click to browse · PNG, JPEG, WebP
              </Trans>
            </span>
          </>
        )}
      </span>
      <input
        {...inputProps}
        type="file"
        accept="image/*"
        className="hidden"
      />
    </button>
  )
}
