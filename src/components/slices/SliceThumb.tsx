/**
 * SliceThumb (spec §4c) — the transparent PNG preview inside a slice card.
 *
 * Renders the slice's objectUrl on the checkerboard so alpha reads true. The
 * image is `object-contain` so tall/wide slices both sit centred.
 */
import type { Slice } from '@/store/types'

export interface SliceThumbProps {
  readonly slice: Slice
}

export function SliceThumb({ slice }: SliceThumbProps) {
  return (
    <div className="bg-checker flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border border-border/50">
      <img
        src={slice.objectUrl}
        alt={slice.name}
        loading="lazy"
        draggable={false}
        className="block h-full w-full object-contain"
      />
    </div>
  )
}
