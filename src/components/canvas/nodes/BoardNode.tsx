/**
 * BoardNode (spec §5 / §7) — the `board` stage on the canvas.
 *
 * Its artifact IS the cutout **source**: dropping a sheet calls the existing
 * `useImageImport` → `store.loadImage`, which drives `useAutoRun` → the worker →
 * `store.analysis` (preview + slices). So this node just re-hosts the shipped
 * source + params + transparent-preview UI unchanged; the `board→slices` edge
 * then visualizes the run. Import here subsumes the old "导入素材图" tab (§9).
 *
 * P3 adds the reverse `compose` action (board → mockup, `ui-mockup-composition`):
 * a plausible UI page re-assembled from this board's assets, gated on the
 * Settings image model with an inline CTA when unset.
 */
import { ChevronLeft, Loader2, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { Trans, useLingui } from '@lingui/react/macro'
import { useSource } from '@/store/selectors'
import { selectBoardStatus } from '@/store/slices/pipeline'
import { useStore } from '@/store'
import { useModelAssignments } from '@/hooks/queries/ai-settings'
import { useComposeMockup } from '@/hooks/queries/pipeline'
import { useSettingsUI } from '@/components/settings/settings-ui'
import { NodeShell } from './NodeShell'
import { DropZone } from '@/components/source/DropZone'
import { SourceCanvas } from '@/components/source/SourceCanvas'
import { SourceMeta } from '@/components/source/SourceMeta'
import { ParameterControls } from '@/components/source/ParameterControls'
import { PreviewPanel } from '@/components/preview/PreviewPanel'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

export function BoardNode() {
  const { t } = useLingui()
  const settings = useSettingsUI()
  const hasSource = useSource().bitmap !== null
  const status = useStore(selectBoardStatus)

  const assignments = useModelAssignments()
  const hasImageModel = Boolean(assignments.data?.image)
  const compose = useComposeMockup()

  function onCompose(): void {
    if (compose.isPending) return
    compose.mutate(undefined, {
      onError: (error) =>
        toast.error(
          t({ id: 'board.toast_compose_failed', message: 'Composition failed' }),
          { description: error.message },
        ),
    })
  }

  return (
    <NodeShell
      badge={<Trans id="pipeline.stage_board">Asset board</Trans>}
      status={status}
      ariaLabel={t({ id: 'pipeline.node_board_aria', message: 'Asset board stage' })}
      hasTarget
      hasSource
    >
      <div className="flex flex-col gap-3 p-3">
        {hasSource ? (
          <>
            <div className="flex h-44">
              <SourceCanvas />
            </div>
            <DropZone variant="compact" />
            <SourceMeta />
            <Separator />
            <ParameterControls />
            <Separator />
            <div className="h-72">
              <PreviewPanel />
            </div>
            <Separator />
            {hasImageModel ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={onCompose}
                disabled={compose.isPending}
              >
                {compose.isPending ? (
                  <>
                    <Loader2 className="animate-spin" />
                    <Trans id="board.composing">Composing mockup…</Trans>
                  </>
                ) : (
                  <>
                    <ChevronLeft />
                    <Trans id="board.compose">Reverse-compose mockup</Trans>
                  </>
                )}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={settings.open}>
                <Settings2 />
                <Trans id="generate.no_model_cta">
                  Configure an image model in Settings
                </Trans>
              </Button>
            )}
          </>
        ) : (
          <DropZone variant="full" />
        )}
      </div>
    </NodeShell>
  )
}
