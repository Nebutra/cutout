/**
 * LibraryDrawer (spec §5/§7) — the global asset library.
 *
 * A right-anchored {@link Sheet} that browses the persistent IndexedDB library
 * (`useAssets`), lets you import images, delete assets, and — the reverse leg —
 * multi-select assets and compose them into a UI mockup via
 * `useComposeFromLibrary` (`ui-mockup-composition`), which lands in the `mockup`
 * node. Calm/opaque per the project UI rule: a plain popover sheet, a thumbnail
 * grid, no glass. Each tile owns its thumbnail object URL (created + revoked).
 */
import { useEffect, useRef, useState } from 'react'
import { ImageOff, Images, Loader2, Trash2, Upload, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { Trans, useLingui } from '@lingui/react/macro'
import type { AssetRef } from '@/services/types'
import { useAddAsset, useAssets, useRemoveAsset } from '@/hooks/queries/assets'
import { useComposeFromLibrary } from '@/hooks/queries/pipeline'
import { useModelAssignments } from '@/hooks/queries/ai-settings'
import { baseName, isSupportedImage } from '@/lib/image'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface LibraryDrawerProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

export function LibraryDrawer({ open, onOpenChange }: LibraryDrawerProps) {
  const { t } = useLingui()
  const assetsQuery = useAssets()
  const addAsset = useAddAsset()
  const removeAsset = useRemoveAsset()
  const compose = useComposeFromLibrary()
  const assignments = useModelAssignments()
  const hasImageModel = Boolean(assignments.data?.image)

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const inputRef = useRef<HTMLInputElement | null>(null)

  const items = assetsQuery.data ?? []
  const selectedCount = selected.size

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function onImport(files: FileList | null): void {
    if (!files) return
    const supported = Array.from(files).filter(isSupportedImage)
    if (supported.length === 0) return
    for (const file of supported) {
      addAsset.mutate(
        { name: `${baseName(file.name)}.png`, blob: file, kind: 'import' },
        {
          onError: (error) =>
            toast.error(
              t({ id: 'library.toast_add_failed', message: 'Could not add to library' }),
              { description: error.message },
            ),
        },
      )
    }
  }

  function onDelete(id: string): void {
    removeAsset.mutate(id, {
      onError: (error) =>
        toast.error(
          t({ id: 'library.toast_remove_failed', message: 'Could not remove asset' }),
          { description: error.message },
        ),
    })
    setSelected((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  function onCompose(): void {
    if (!hasImageModel || selectedCount === 0 || compose.isPending) return
    compose.mutate([...selected], {
      onSuccess: () => {
        setSelected(new Set())
        onOpenChange(false)
        toast.success(
          t({ id: 'library.toast_composed', message: 'Prototype generated into the mockup node' }),
        )
      },
      onError: (error) =>
        toast.error(
          t({ id: 'library.toast_compose_failed', message: 'Composition failed' }),
          { description: error.message },
        ),
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-describedby={undefined}>
        <SheetHeader>
          <div className="flex items-center justify-between gap-2 pr-6">
            <SheetTitle className="flex items-center gap-1.5">
              <Images className="size-4 text-muted-foreground" />
              <Trans id="library.title">Asset library</Trans>
            </SheetTitle>
            <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()}>
              <Upload />
              <Trans id="library.import">Import</Trans>
            </Button>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {assetsQuery.isLoading ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
              <ImageOff className="size-6 opacity-70" />
              <span className="text-xs">
                <Trans id="library.empty">
                  Empty for now — add slices or generated images to the library, or import your own.
                </Trans>
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {items.map((asset) => (
                <AssetTile
                  key={asset.id}
                  asset={asset}
                  selected={selected.has(asset.id)}
                  onToggle={toggle}
                  onDelete={onDelete}
                  deleteLabel={t({ id: 'library.delete', message: 'Remove from library' })}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-border/60 px-4 py-3">
          {!hasImageModel ? (
            <p className="text-xs text-muted-foreground">
              <Trans id="library.no_model">
                Configure an image model in Settings to generate.
              </Trans>
            </p>
          ) : null}
          <Button
            onClick={onCompose}
            disabled={!hasImageModel || selectedCount === 0 || compose.isPending}
          >
            {compose.isPending ? (
              <>
                <Loader2 className="animate-spin" />
                <Trans id="library.composing">Generating…</Trans>
              </>
            ) : (
              <>
                <Wand2 />
                <Trans id="library.compose">Generate prototype</Trans>
                {selectedCount > 0 ? ` (${selectedCount})` : null}
              </>
            )}
          </Button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            onImport(e.target.files)
            e.target.value = ''
          }}
        />
      </SheetContent>
    </Sheet>
  )
}

interface AssetTileProps {
  readonly asset: AssetRef
  readonly selected: boolean
  readonly onToggle: (id: string) => void
  readonly onDelete: (id: string) => void
  readonly deleteLabel: string
}

function AssetTile({ asset, selected, onToggle, onDelete, deleteLabel }: AssetTileProps) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!asset.thumb) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(asset.thumb)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [asset.thumb])

  return (
    <div className="group relative flex flex-col gap-1">
      <button
        type="button"
        onClick={() => onToggle(asset.id)}
        aria-pressed={selected}
        title={asset.name}
        className={cn(
          'flex aspect-square items-center justify-center overflow-hidden rounded-lg border bg-muted/30 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
          selected ? 'border-primary ring-2 ring-primary' : 'border-border/60',
        )}
      >
        {url ? (
          <img src={url} alt="" className="size-full object-contain" />
        ) : (
          <ImageOff className="size-4 text-muted-foreground opacity-70" />
        )}
      </button>
      <button
        type="button"
        aria-label={deleteLabel}
        onClick={() => onDelete(asset.id)}
        className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-md bg-background/90 text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100 [&_svg]:size-3"
      >
        <Trash2 />
      </button>
      <span className="truncate text-[11px] text-muted-foreground">{asset.name}</span>
    </div>
  )
}
