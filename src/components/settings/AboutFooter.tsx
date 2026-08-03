/**
 * AboutFooter — a single line pinned to the bottom of the Settings sidebar.
 *
 * The product's compact identity row: name + version. Clicking preserves the
 * technical About details in a toast (no dedicated About section).
 */
import { toast } from 'sonner'
import { useLingui } from '@lingui/react/macro'
import { Info } from 'lucide-react'
import { PRODUCT_VERSION } from '@/product-version'

export function AboutFooter() {
  const { t } = useLingui()
  return (
    <button
      type="button"
      onClick={() =>
        toast('Cutout', {
          description: t({
            id: 'settings.about_description',
            message:
              'AI-Native UI/UX · Tauri 2 · React 19 — local, offline-first.',
          }),
        })
      }
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
    >
      <Info className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">Cutout</span>
      <span className="shrink-0 tabular-nums">v{PRODUCT_VERSION}</span>
    </button>
  )
}
