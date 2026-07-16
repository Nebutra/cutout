/**
 * SliceDimensions (spec §4c) — W×H · position · byte size for the selected slice.
 */
import { useEffect, useState } from 'react'
import { Trans } from '@lingui/react/macro'
import type { Slice } from '@/store/types'
import { useStore } from '@/store'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { formatBytes } from '@/lib/image'

export interface SliceDimensionsProps {
  readonly slice: Slice
}

export function SliceDimensions({ slice }: SliceDimensionsProps) {
  const updateBounds = useStore((state) => state.updateSliceBounds)
  const [draft, setDraft] = useState(slice.box)
  useEffect(() => setDraft(slice.box), [slice.id, slice.box])
  const valid = [draft.x, draft.y, draft.width, draft.height].every(Number.isFinite) && draft.x >= 0 && draft.y >= 0 && draft.width > 0 && draft.height > 0
  return (
    <div className="grid gap-3">
    <dl className="grid grid-cols-2 gap-2 text-xs">
      <Field label={<Trans id="inspector.dim_size">Size</Trans>}>
        <Badge variant="secondary" className="font-mono tabular-nums">
          {slice.width}×{slice.height}
        </Badge>
      </Field>
      <Field label={<Trans id="inspector.dim_bytes">Bytes</Trans>}>
        <span className="font-mono tabular-nums text-muted-foreground">
          {formatBytes(slice.blob.size)}
        </span>
      </Field>
      <Field label={<Trans id="inspector.dim_position">Position</Trans>}>
        <span className="font-mono tabular-nums text-muted-foreground">
          {slice.box.x}, {slice.box.y}
        </span>
      </Field>
      <Field label={<Trans id="inspector.dim_index">Index</Trans>}>
        <span className="font-mono tabular-nums text-muted-foreground">
          #{slice.index + 1}
        </span>
      </Field>
    </dl>
      <fieldset className="grid grid-cols-4 gap-1.5">
        <legend className="mb-1 text-[10px] tracking-wide text-muted-foreground uppercase">Bounds</legend>
        {(['x', 'y', 'width', 'height'] as const).map((key) => <label key={key} className="grid gap-1 text-[10px] uppercase text-muted-foreground"><span>{key === 'width' ? 'W' : key === 'height' ? 'H' : key.toUpperCase()}</span><Input aria-label={`Bounds ${key}`} type="number" min={key === 'x' || key === 'y' ? 0 : 1} value={draft[key]} className="h-7 px-1.5 font-mono text-xs" onChange={(event) => setDraft((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}
      </fieldset>
      <Button size="sm" variant="outline" disabled={!valid || (draft.x === slice.box.x && draft.y === slice.box.y && draft.width === slice.box.width && draft.height === slice.box.height)} onClick={() => updateBounds(slice.id, draft)}>Apply bounds</Button>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  )
}
