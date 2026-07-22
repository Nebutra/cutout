/**
 * HelpMenu — Figma-style floating "?" pinned to the bottom-right corner.
 * External links open the project's GitLab (documentation, feedback);
 * "Change language" routes to the Settings dialog where the switch lives.
 */
import { BookOpen, CircleHelp, Languages, MessageSquarePlus } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSettingsUI } from '@/components/settings/settings-ui'

const REPO_URL = 'https://g.ktvsky.com/luzikai/asset-cutout-studio'

function openExternal(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function HelpMenu() {
  const { t } = useLingui()
  const { open: openSettings } = useSettingsUI()

  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-40 hidden sm:block">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="pointer-events-auto rounded-full shadow-md"
            aria-label={t({ id: 'help.menu_label', message: 'Help and resources' })}
          >
            <CircleHelp className="size-4.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-56">
          <DropdownMenuItem onSelect={() => openExternal(REPO_URL)}>
            <BookOpen className="size-4" />
            {t({ id: 'help.documentation', message: 'Documentation' })}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openExternal(`${REPO_URL}/-/issues/new`)}>
            <MessageSquarePlus className="size-4" />
            {t({ id: 'help.submit_feedback', message: 'Submit feedback' })}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => openSettings()}>
            <Languages className="size-4" />
            {t({ id: 'help.change_language', message: 'Change language...' })}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Cutout v0.1.3
          </DropdownMenuLabel>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
