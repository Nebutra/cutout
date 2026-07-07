/**
 * MockupNode (spec §5 / §6) — the `mockup` stage: a generated/imported UI
 * prototype image, midway in the forward chain.
 *
 * Shows the current mockup (store `mockup`) and drives the next transition:
 * **deconstruct** it into a cutout-ready asset board (`ui-asset-deconstruction`
 * → `store.loadImage` → the existing cutout auto-run). It can also be
 * **regenerated** from the brief or **replaced** by importing your own image.
 * Generation is gated on the Settings image model (inline CTA when unset). The
 * image object URL is created from the blob and revoked on replacement/unmount.
 */
import { useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  ImageOff,
  Library,
  Loader2,
  RefreshCw,
  Settings2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { Trans, useLingui } from '@lingui/react/macro'
import { useStore } from '@/store'
import { selectMockupStatus } from '@/store/slices/pipeline'
import { useModelAssignments } from '@/hooks/queries/ai-settings'
import { useAddAsset } from '@/hooks/queries/assets'
import {
  useDeconstructMockup,
  useGenerateMockup,
  useImportMockup,
} from '@/hooks/queries/pipeline'
import { useSettingsUI } from '@/components/settings/settings-ui'
import { NodeShell } from './NodeShell'
import { ImageZoom } from './ImageZoom'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

export function MockupNode() {
  const { t } = useLingui()
  const settings = useSettingsUI()
  const mockup = useStore((s) => s.mockup)
  const brief = useStore((s) => s.brief)
  const status = useStore(selectMockupStatus)

  const assignments = useModelAssignments()
  const hasImageModel = Boolean(assignments.data?.image)
  const generate = useGenerateMockup()
  const deconstruct = useDeconstructMockup()
  const importMockup = useImportMockup()
  const addAsset = useAddAsset()
  const inputRef = useRef<HTMLInputElement | null>(null)

  function onAddToLibrary(): void {
    if (!mockup || addAsset.isPending) return
    addAsset.mutate(
      { name: 'mockup.png', blob: mockup.blob, kind: 'generated' },
      {
        onSuccess: () =>
          toast.success(
            t({ id: 'mockup.toast_added_to_library', message: 'Added to library' }),
          ),
        onError: (error) =>
          toast.error(
            t({ id: 'library.toast_add_failed', message: 'Could not add to library' }),
            { description: error.message },
          ),
      },
    )
  }

  // Object URL for the mockup blob, recreated + revoked as the artifact changes.
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!mockup) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(mockup.blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [mockup])

  const busy = generate.isPending || deconstruct.isPending

  function onDeconstruct(): void {
    if (busy) return
    deconstruct.mutate(undefined, {
      onError: (error) =>
        toast.error(t({ id: 'mockup.toast_deconstruct_failed', message: 'Deconstruction failed' }), {
          description: error.message,
        }),
    })
  }

  function onRegenerate(): void {
    if (busy || !brief.trim()) return
    generate.mutate(undefined, {
      onError: (error) =>
        toast.error(t({ id: 'generate.toast_failed', message: 'Generation failed' }), {
          description: error.message,
        }),
    })
  }

  return (
    <NodeShell
      badge={<Trans id="pipeline.stage_mockup">Mockup</Trans>}
      status={status}
      ariaLabel={t({ id: 'pipeline.node_mockup_aria', message: 'Mockup stage' })}
      width={360}
      hasTarget
      hasSource
    >
      <div className="flex flex-col gap-3 p-3">
        <div className="flex h-56 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/30">
          {url ? (
            <ImageZoom
              src={url}
              label={t({ id: 'mockup.preview_zoom', message: 'Enlarge mockup preview' })}
            />
          ) : status === 'running' ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
              <span className="text-xs">
                <Trans id="mockup.generating">Generating mockup…</Trans>
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 px-6 text-center text-muted-foreground">
              <ImageOff className="size-6 opacity-70" />
              <span className="text-xs">
                <Trans id="mockup.empty">Generate from the brief, or import a screenshot.</Trans>
              </span>
            </div>
          )}
        </div>

        {hasImageModel ? (
          <Button onClick={onDeconstruct} disabled={!mockup || busy}>
            {deconstruct.isPending ? (
              <>
                <Loader2 className="animate-spin" />
                <Trans id="mockup.deconstructing">Deconstructing…</Trans>
              </>
            ) : (
              <>
                <Trans id="mockup.deconstruct">Deconstruct to board</Trans>
                <ChevronRight />
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

        <Separator />

        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1"
            onClick={onRegenerate}
            disabled={!hasImageModel || !brief.trim() || busy}
          >
            {generate.isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            <Trans id="mockup.regenerate">Regenerate</Trans>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            <Upload />
            <Trans id="mockup.import_replace">Import</Trans>
          </Button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onAddToLibrary}
          disabled={!mockup || addAsset.isPending}
        >
          {addAsset.isPending ? <Loader2 className="animate-spin" /> : <Library />}
          <Trans id="mockup.add_to_library">Add to library</Trans>
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
