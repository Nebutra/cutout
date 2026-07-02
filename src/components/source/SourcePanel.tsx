/**
 * SourcePanel (spec §4c) — left pane: the source image + its read parameters.
 *
 * Empty state offers two ways to get a sheet in: Import an existing asset sheet,
 * or Generate one from a UI screenshot (the AI-native front half). Either path
 * loads a source; the loaded state then shows the source canvas, a slim replace
 * bar, meta, and the parameter sliders (params sit under the source because they
 * govern how it is read).
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Trans } from '@lingui/react/macro'
import { cn } from '@/lib/utils'
import { useSource } from '@/store/selectors'
import { DropZone } from './DropZone'
import { GeneratePanel } from './GeneratePanel'
import { SourceCanvas } from './SourceCanvas'
import { SourceMeta } from './SourceMeta'
import { ParameterControls } from './ParameterControls'
import { Separator } from '@/components/ui/separator'

type SourceMode = 'import' | 'generate'

export function SourcePanel() {
  const hasSource = useSource().bitmap !== null
  const [mode, setMode] = useState<SourceMode>('import')

  if (hasSource) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 p-3">
        <SourceCanvas />
        <DropZone variant="compact" />
        <SourceMeta />
        <Separator />
        <ParameterControls />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="flex items-center gap-0.5 rounded-lg bg-muted/40 p-0.5">
        <ModeTab active={mode === 'import'} onClick={() => setMode('import')}>
          <Trans id="source.mode_import">Import sheet</Trans>
        </ModeTab>
        <ModeTab active={mode === 'generate'} onClick={() => setMode('generate')}>
          <Trans id="source.mode_generate">Generate from screenshot</Trans>
        </ModeTab>
      </div>

      {mode === 'import' ? <DropZone variant="full" /> : <GeneratePanel />}
    </div>
  )
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  readonly active: boolean
  readonly onClick: () => void
  readonly children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex-1 rounded-md px-3 py-1.5 text-sm transition-colors',
        active
          ? 'bg-background font-medium text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
