/**
 * ImageZoom (spec §5) — a preview thumbnail that opens the full image in a
 * click-to-dismiss overlay, so a generated mockup / style sheet / node output can
 * be inspected at size without leaving the canvas.
 *
 * The thumbnail is a real <button> (keyboard- and screen-reader-reachable, shows
 * a `zoom-in` cursor); activating it opens the shared shadcn Dialog with the
 * image on a calm, opaque popover frame — per the project UI rule, no glass and
 * no neon. It renders inside the node body's `nodrag nowheel` region, so the
 * click never starts a React Flow pan/drag.
 */
import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export interface ImageZoomProps {
  /** Object URL (or data URL) of the image, shown at both thumbnail and full size. */
  readonly src: string
  /** Accessible label for the trigger and the (visually hidden) dialog title. */
  readonly label: string
  /** Extra classes for the thumbnail <img>; the caller owns its box sizing. */
  readonly className?: string
}

export function ImageZoom({ src, label, className }: ImageZoomProps) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen(true)}
        className="flex size-full cursor-zoom-in items-center justify-center rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <img
          src={src}
          alt=""
          className={cn('max-h-full max-w-full object-contain', className)}
        />
      </button>

      <DialogContent aria-describedby={undefined} className="w-fit max-w-[92vw] gap-0 p-2">
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <img
          src={src}
          alt=""
          className="max-h-[86vh] max-w-[88vw] rounded-md object-contain"
        />
      </DialogContent>
    </Dialog>
  )
}
