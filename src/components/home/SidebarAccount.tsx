/**
 * SidebarAccount — Figma-style account row at the top of the home sidebar:
 * an avatar menu (identity, theme, settings) on the left and a notification
 * bell on the right. Cutout is local-only, so the identity is the local
 * workspace rather than a signed-in account; theme and settings moved here
 * from the TopBar.
 */
import { Bell, Check, ChevronDown, Monitor, Moon, Scissors, Settings2, Sun, SwatchBook } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useLingui } from '@lingui/react/macro'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSettingsUI } from '@/components/settings/settings-ui'

export function SidebarAccount() {
  return (
    <div className="flex items-center justify-between gap-2">
      <AccountMenu />
      <NotificationsMenu />
    </div>
  )
}

function AccountMenu() {
  const { t } = useLingui()
  const { theme, setTheme } = useTheme()
  const { open: openSettings } = useSettingsUI()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t({ id: 'home.account_menu', message: 'Workspace menu' })}
          className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold transition-colors hover:bg-muted"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
            <Scissors className="size-3.5" />
          </span>
          <span className="truncate">Cutout</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="flex flex-col items-center gap-1 py-4">
          <span className="flex size-10 items-center justify-center rounded-full bg-foreground text-background">
            <Scissors className="size-5" />
          </span>
          <span className="mt-1 text-sm font-semibold">
            {t({ id: 'home.local_workspace', message: 'Local workspace' })}
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {t({ id: 'home.local_workspace_hint', message: 'Projects stay on this device' })}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SwatchBook className="size-4" />
            {t({ id: 'home.change_theme', message: 'Change theme' })}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme ?? 'system'} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">
                <Sun className="size-4" /> {t({ id: 'home.theme_light', message: 'Light' })}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon className="size-4" /> {t({ id: 'home.theme_dark', message: 'Dark' })}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor className="size-4" /> {t({ id: 'home.theme_system', message: 'System' })}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={openSettings}>
          <Settings2 className="size-4" />
          {t({ id: 'settings.menu_label', message: 'Settings' })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NotificationsMenu() {
  const { t } = useLingui()
  const label = t({ id: 'home.notifications', message: 'Notifications' })

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={label}>
              <Bell className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="flex flex-col items-center gap-1 px-4 py-6 text-center">
          <Check className="size-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {t({ id: 'home.notifications_empty', message: "You're all caught up" })}
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
