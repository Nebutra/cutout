/**
 * BriefNode (spec §5 / §6) — the `brief` stage: the head of the forward chain.
 *
 * Holds the free-text product requirement (store `brief`) and offers the two
 * ways to reach a mockup: **generate** one from the brief via the Settings image
 * model (`ui-mockup-generation`), or **import** your own screenshot straight
 * into the `mockup` node (§9). No image model configured → an inline CTA opens
 * Settings, matching the retired GeneratePanel's pattern. Calm/opaque per the UI
 * rule; the reused controls live under a `nodrag nowheel` body in NodeShell.
 */
import { useRef } from 'react'
import { FileUp, Loader2, Settings2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Trans, useLingui } from '@lingui/react/macro'
import { useStore } from '@/store'
import { selectBriefStatus } from '@/store/slices/pipeline'
import { useModelAssignments } from '@/hooks/queries/ai-settings'
import { useGenerateMockup, useImportMockup } from '@/hooks/queries/pipeline'
import { useSettingsUI } from '@/components/settings/settings-ui'
import { NodeShell } from './NodeShell'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function BriefNode() {
  const { t } = useLingui()
  const settings = useSettingsUI()
  const brief = useStore((s) => s.brief)
  const setBrief = useStore((s) => s.setBrief)
  const status = useStore(selectBriefStatus)

  const assignments = useModelAssignments()
  const hasImageModel = Boolean(assignments.data?.image)
  const generate = useGenerateMockup()
  const importMockup = useImportMockup()
  const inputRef = useRef<HTMLInputElement | null>(null)

  const canGenerate = brief.trim().length > 0 && !generate.isPending

  function onGenerate(): void {
    if (!canGenerate) return
    generate.mutate(undefined, {
      onError: (error) =>
        toast.error(t({ id: 'generate.toast_failed', message: 'Generation failed' }), {
          description: error.message,
        }),
    })
  }

  return (
    <NodeShell
      badge={<Trans id="pipeline.stage_brief">Brief</Trans>}
      status={status}
      ariaLabel={t({ id: 'pipeline.node_brief_aria', message: 'Brief stage' })}
      width={360}
      hasSource
    >
      <div className="flex flex-col gap-3 p-3">
        <Textarea
          value={brief}
          rows={6}
          onChange={(e) => setBrief(e.target.value)}
          placeholder={t({
            id: 'brief.placeholder',
            message: 'Describe the product and its main screen — who it is for, what it shows…',
          })}
        />

        {hasImageModel ? (
          <Button onClick={onGenerate} disabled={!canGenerate}>
            {generate.isPending ? (
              <>
                <Loader2 className="animate-spin" />
                <Trans id="brief.generating">Generating…</Trans>
              </>
            ) : (
              <>
                <Sparkles />
                <Trans id="brief.generate">Generate mockup</Trans>
              </>
            )}
          </Button>
        ) : (
          <Button variant="outline" onClick={settings.open}>
            <Settings2 />
            <Trans id="generate.no_model_cta">
              Configure an image model in Settings
            </Trans>
          </Button>
        )}

        <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
          <FileUp />
          <Trans id="brief.import_mockup">Import mockup</Trans>
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void importMockup(file)
          }}
        />
      </div>
    </NodeShell>
  )
}
