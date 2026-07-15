/**
 * CanvasBackgroundPicker — Lovart-style canvas background control.
 *
 * A small swatch button pinned to the canvas corner opens a panel with an
 * HSV saturation/value pad, a hue slider, preset swatches and a hex field.
 * The chosen hex persists via canvas-background.ts; null means the default
 * canvas wash.
 */
import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import {
  CANVAS_BACKGROUND_PRESETS,
  hexToHsv,
  hsvToHex,
  normalizeHex,
  type Hsv,
} from './canvas-background'

export function CanvasBackgroundPicker({
  value,
  onChange,
}: {
  readonly value: string | null
  readonly onChange: (hex: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value ?? '#f5f5f5'))
  const [hexDraft, setHexDraft] = useState((value ?? '#f5f5f5').replace('#', ''))
  const current = value ?? '#f5f5f5'

  const apply = (next: Hsv) => {
    setHsv(next)
    const hex = hsvToHex(next)
    setHexDraft(hex.replace('#', ''))
    onChange(hex)
  }
  const applyHex = (hex: string) => {
    setHsv(hexToHsv(hex))
    setHexDraft(hex.replace('#', ''))
    onChange(hex)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setHsv(hexToHsv(current))
          setHexDraft(current.replace('#', ''))
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Canvas background"
          title="Canvas background"
          className="group flex size-8 items-center justify-center rounded-full border border-border/70 bg-background/95 shadow-[0_2px_10px_rgb(0_0_0/0.10)] backdrop-blur transition-all hover:scale-105 hover:border-foreground/25"
        >
          <span
            aria-hidden="true"
            className="size-4.5 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] transition-transform group-hover:scale-110"
            style={{ background: current }}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-72 p-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Canvas Background</p>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close canvas background picker"
            onClick={() => setOpen(false)}
          >
            <X className="size-3.5" />
          </Button>
        </div>

        <SaturationPad hsv={hsv} onChange={apply} />

        <input
          type="range"
          min={0}
          max={359}
          value={Math.round(hsv.h)}
          aria-label="Hue"
          onChange={(event) => apply({ ...hsv, h: Number(event.target.value) })}
          className="mt-3 h-3 w-full cursor-pointer appearance-none rounded-full"
          style={{
            background:
              'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
          }}
        />

        <div className="mt-3 flex items-center gap-2">
          {CANVAS_BACKGROUND_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-label={`Set canvas background ${preset}`}
              aria-pressed={current === preset}
              onClick={() => applyHex(preset)}
              className={cn(
                'size-7 rounded-full border transition-shadow',
                current === preset
                  ? 'border-ring ring-2 ring-ring/40'
                  : 'border-border hover:ring-2 hover:ring-ring/20',
              )}
              style={{ background: preset }}
            />
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">#</span>
          <Input
            value={hexDraft}
            aria-label="Canvas background hex"
            spellCheck={false}
            className="h-8 font-mono text-xs uppercase"
            onChange={(event) => {
              setHexDraft(event.target.value)
              const normalized = normalizeHex(event.target.value)
              if (normalized) {
                setHsv(hexToHsv(normalized))
                onChange(normalized)
              }
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SaturationPad({
  hsv,
  onChange,
}: {
  readonly hsv: Hsv
  readonly onChange: (hsv: Hsv) => void
}) {
  const padRef = useRef<HTMLDivElement>(null)

  const update = (clientX: number, clientY: number) => {
    const pad = padRef.current
    if (!pad) return
    const rect = pad.getBoundingClientRect()
    const s = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const v = 1 - Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
    onChange({ ...hsv, s, v })
  }

  return (
    <div
      ref={padRef}
      role="slider"
      aria-label="Saturation and brightness"
      aria-valuenow={Math.round(hsv.s * 100)}
      tabIndex={0}
      className="relative mt-3 h-36 w-full cursor-crosshair touch-none rounded-md border border-border"
      style={{
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`,
      }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        update(event.clientX, event.clientY)
      }}
      onPointerMove={(event) => {
        if (event.buttons & 1) update(event.clientX, event.clientY)
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.3)]"
        style={{
          left: `${hsv.s * 100}%`,
          top: `${(1 - hsv.v) * 100}%`,
          background: hsvToHex(hsv),
        }}
      />
    </div>
  )
}
