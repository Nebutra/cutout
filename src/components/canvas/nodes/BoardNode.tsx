/**
 * BoardNode (spec §5 / §7) — the `board` stage on the canvas.
 *
 * Its artifact IS the cutout **source**: dropping a sheet calls the existing
 * `useImageImport` → `store.loadImage`, which drives `useAutoRun` → the worker →
 * `store.analysis` (preview + slices). So this node just re-hosts the shipped
 * source + params + transparent-preview UI unchanged; the `board→slices` edge
 * then visualizes the run. Import here subsumes the old "导入素材图" tab (§9).
 */
import { Trans, useLingui } from '@lingui/react/macro'
import { useSource } from '@/store/selectors'
import { selectBoardStatus } from '@/store/slices/pipeline'
import { useStore } from '@/store'
import { NodeShell } from './NodeShell'
import { DropZone } from '@/components/source/DropZone'
import { SourceCanvas } from '@/components/source/SourceCanvas'
import { SourceMeta } from '@/components/source/SourceMeta'
import { ParameterControls } from '@/components/source/ParameterControls'
import { PreviewPanel } from '@/components/preview/PreviewPanel'
import { Separator } from '@/components/ui/separator'

export function BoardNode() {
  const { t } = useLingui()
  const hasSource = useSource().bitmap !== null
  const status = useStore(selectBoardStatus)

  return (
    <NodeShell
      badge={<Trans id="pipeline.stage_board">Asset board</Trans>}
      status={status}
      ariaLabel={t({ id: 'pipeline.node_board_aria', message: 'Asset board stage' })}
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
          </>
        ) : (
          <DropZone variant="full" />
        )}
      </div>
    </NodeShell>
  )
}
