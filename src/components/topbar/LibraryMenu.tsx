/**
 * LibraryMenu — the TopBar button that opens the asset-library drawer.
 *
 * Mirrors `SettingsMenu`: the drawer's open state is owned by `AppShell`; this
 * button reaches it through the `LibraryUI` context.
 */
import { Images } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useLibraryUI } from '@/components/library/library-ui'

export function LibraryMenu() {
  const { t } = useLingui()
  const { open } = useLibraryUI()
  const label = t({ id: 'library.menu_label', message: 'Asset library' })

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={open}>
          <Images />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
