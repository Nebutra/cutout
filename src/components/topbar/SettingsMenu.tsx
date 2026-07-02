/**
 * SettingsMenu — the TopBar gear. Opens the unified `SettingsDialog`.
 *
 * The dialog's open state is owned by `AppShell` (so `⌘,` can toggle it too);
 * this button reaches it through the `SettingsUI` context. It used to be a
 * dropdown of loose actions (reset, providers, language, about) — all of those
 * now live inside the dialog.
 */
import { Settings2 } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useSettingsUI } from '@/components/settings/settings-ui'

export function SettingsMenu() {
  const { t } = useLingui()
  const { open } = useSettingsUI()
  const label = t({ id: 'settings.menu_label', message: 'Settings' })

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={open}>
          <Settings2 />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
