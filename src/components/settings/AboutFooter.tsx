/**
 * AboutFooter — a single line pinned to the bottom of the Settings sidebar.
 *
 * The product's "about" surface: version + stack. Clicking toasts the identity
 * (kept lightweight per the design's restraint principle — no About section).
 */
import { toast } from 'sonner'
import { useLingui } from '@lingui/react/macro'

/** Build version. Bump alongside `package.json` / `Cargo.toml`. */
const APP_VERSION = '0.1.2'

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
      className="w-full truncate rounded-md px-2.5 py-1.5 text-left text-[11px] text-muted-foreground/70 transition-colors hover:text-muted-foreground"
    >
      Cutout v{APP_VERSION} · Tauri 2 · React 19
    </button>
  )
}
