/**
 * SlicesNode (spec §5 / §7) — the `slices` stage on the canvas.
 *
 * Its artifact IS the existing `store.analysis`. This node re-hosts the shipped
 * outputs UI — the `SliceGrid` plus the inspector/rename — via `RightRail`
 * unchanged, so selection, rename, and export keep working exactly as before,
 * now inside a card. Status is derived from the analysis lifecycle.
 */
import { Trans, useLingui } from '@lingui/react/macro'
import { useStore } from '@/store'
import { selectSlicesStatus } from '@/store/slices/pipeline'
import { NodeShell } from './NodeShell'
import { RightRail } from '@/components/slices/RightRail'

export function SlicesNode() {
  const { t } = useLingui()
  const status = useStore(selectSlicesStatus)

  return (
    <NodeShell
      badge={<Trans id="pipeline.stage_slices">Slices</Trans>}
      status={status}
      ariaLabel={t({ id: 'pipeline.node_slices_aria', message: 'Slices stage' })}
      width={420}
      hasTarget
    >
      <div className="h-[34rem]">
        <RightRail />
      </div>
    </NodeShell>
  )
}
