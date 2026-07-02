/**
 * GeneratePanel — the "prompt box": proto (UI screenshot) → generated asset sheet.
 *
 * Front half of the AI-native chain. Drop a UI screenshot (+ optional brief),
 * generate via the `ui-asset-deconstruction` system prompt using the Settings
 * "image generation" model, and the result loads as the cutout source (the
 * existing slice → export flow takes over). No image model configured → an
 * inline CTA opens Settings.
 */
import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Loader2, Settings2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Trans, useLingui } from '@lingui/react/macro'
import { cn } from '@/lib/utils'
import { isSupportedImage } from '@/lib/image'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useModelAssignments } from '@/hooks/queries/ai-settings'
import { useGenerateFromProto } from '@/hooks/queries/generate'
import { useSettingsUI } from '@/components/settings/settings-ui'

interface Proto {
  readonly file: File
  readonly url: string
}

interface GeneratePanelProps {
  /** Called after a sheet is generated + loaded (lets the parent show it). */
  readonly onGenerated?: () => void
}

export function GeneratePanel({ onGenerated }: GeneratePanelProps) {
  const { t } = useLingui()
  const settings = useSettingsUI()
  const assignments = useModelAssignments()
  const generate = useGenerateFromProto()
  const hasImageModel = Boolean(assignments.data?.image)

  const [proto, setProto] = useState<Proto | null>(null)
  const [requirement, setRequirement] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Revoke the preview URL on replacement / unmount.
  useEffect(() => {
    return () => {
      if (proto) URL.revokeObjectURL(proto.url)
    }
  }, [proto])

  function pickFile(file: File | undefined): void {
    if (!file) return
    if (!isSupportedImage(file)) {
      const name = file.name
      toast.error(
        t({ id: 'import.toast_unsupported', message: `Unsupported file: ${name}` }),
      )
      return
    }
    setProto({ file, url: URL.createObjectURL(file) })
  }

  async function onGenerate(): Promise<void> {
    if (generate.isPending) return
    if (!proto && !requirement.trim()) return
    const bytes = proto
      ? new Uint8Array(await proto.file.arrayBuffer())
      : undefined
    generate.mutate(
      { bytes, mediaType: proto?.file.type ?? 'image/png', requirement },
      {
        onSuccess: () => {
          toast.success(
            t({ id: 'generate.toast_done', message: 'Asset sheet generated — slicing…' }),
          )
          onGenerated?.()
        },
        onError: (error) =>
          toast.error(
            t({ id: 'generate.toast_failed', message: 'Generation failed' }),
            { description: error.message },
          ),
      },
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          pickFile(e.dataTransfer.files?.[0])
        }}
        className={cn(
          'flex min-h-40 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/30 text-center transition-colors hover:border-ring/50 hover:bg-muted/40',
          proto ? 'p-2' : 'px-6 py-8',
        )}
      >
        {proto ? (
          <img
            src={proto.url}
            alt=""
            className="max-h-56 w-full rounded-lg object-contain"
          />
        ) : (
          <>
            <ImagePlus className="size-7 opacity-70" />
            <span className="text-sm font-medium">
              <Trans id="generate.proto_title">Drop a UI screenshot</Trans>
            </span>
            <span className="text-xs text-muted-foreground">
              <Trans id="generate.proto_hint">
                Regenerated into a clean, cutout-ready asset sheet.
              </Trans>
            </span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            pickFile(file)
          }}
        />
      </button>

      <Textarea
        value={requirement}
        rows={3}
        onChange={(e) => setRequirement(e.target.value)}
        placeholder={t({
          id: 'generate.requirement_placeholder',
          message: 'Optional brief — style, which elements to emphasize…',
        })}
      />

      {hasImageModel ? (
        <Button
          onClick={onGenerate}
          disabled={(!proto && !requirement.trim()) || generate.isPending}
        >
          {generate.isPending ? (
            <>
              <Loader2 className="animate-spin" />
              <Trans id="generate.pending">Generating…</Trans>
            </>
          ) : (
            <>
              <Sparkles />
              <Trans id="generate.button">Generate asset sheet</Trans>
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
    </div>
  )
}
