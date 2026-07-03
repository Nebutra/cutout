/**
 * SlicesNode (spec §5 / §7 / §8) — the `slices` stage on the canvas.
 *
 * Its artifact IS the existing `store.analysis`. This node re-hosts the shipped
 * outputs UI — the `SliceGrid` plus the inspector/rename — via `RightRail`
 * unchanged, so selection, rename, and export keep working exactly as before,
 * now inside a card. Status is derived from the analysis lifecycle.
 *
 * P3 adds the optional **语义命名** action (spec §8): a vision pass that renames
 * every slice semantically. It is gated on a chat/vision model being assigned —
 * an inline CTA opens Settings when unset; naming is optional (fallback = the
 * existing numbered names), so the grid never depends on it.
 */
import { Loader2, Settings2, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { Trans, useLingui } from '@lingui/react/macro'
import { useStore } from '@/store'
import { selectHasSlices } from '@/store/selectors'
import { selectSlicesStatus } from '@/store/slices/pipeline'
import { useModelAssignments } from '@/hooks/queries/ai-settings'
import { useNameSlices } from '@/hooks/queries/pipeline'
import { useSettingsUI } from '@/components/settings/settings-ui'
import { NodeShell } from './NodeShell'
import { RightRail } from '@/components/slices/RightRail'
import { Button } from '@/components/ui/button'

export function SlicesNode() {
  const { t } = useLingui()
  const settings = useSettingsUI()
  const status = useStore(selectSlicesStatus)
  const hasSlices = useStore(selectHasSlices)

  const assignments = useModelAssignments()
  const hasChatModel = Boolean(assignments.data?.chat)
  const name = useNameSlices()

  function onName(): void {
    if (name.isPending) return
    name.mutate(undefined, {
      onSuccess: (count) =>
        toast.success(
          t({ id: 'slices.toast_named', message: `Named ${count} slices` }),
        ),
      onError: (error) =>
        toast.error(
          t({ id: 'slices.toast_name_failed', message: 'Naming failed' }),
          { description: error.message },
        ),
    })
  }

  return (
    <NodeShell
      badge={<Trans id="pipeline.stage_slices">Slices</Trans>}
      status={status}
      ariaLabel={t({ id: 'pipeline.node_slices_aria', message: 'Slices stage' })}
      width={420}
      hasTarget
    >
      <div className="flex h-[34rem] flex-col">
        <div className="shrink-0 border-b border-border/60 p-2">
          {hasChatModel ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={onName}
              disabled={!hasSlices || name.isPending}
            >
              {name.isPending ? (
                <>
                  <Loader2 className="animate-spin" />
                  <Trans id="slices.naming">Naming slices…</Trans>
                </>
              ) : (
                <>
                  <Tags />
                  <Trans id="slices.name">Semantic naming</Trans>
                </>
              )}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={settings.open}
            >
              <Settings2 />
              <Trans id="slices.name_no_model_cta">
                Configure a chat model to name slices
              </Trans>
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1">
          <RightRail />
        </div>
      </div>
    </NodeShell>
  )
}
