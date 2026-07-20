/**
 * SidebarAccount — Figma-style account row at the top of the home sidebar:
 * an avatar menu (identity, theme, settings) on the left and a notification
 * bell on the right. Cutout is local-only, so the identity is the local
 * workspace rather than a signed-in account; theme and settings moved here
 * from the TopBar.
 */
import { Bell, Check, CheckCircle2, ChevronDown, CircleAlert, Monitor, Moon, Settings2, Sun, SwatchBook, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { useLingui } from '@lingui/react/macro'
import { Button } from '@/components/ui/button'
import { CutoutBrandMark } from '@/components/brand/CutoutBrandMark'
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
import { clearLocalNotifications, loadLocalNotifications, markLocalNotificationsRead, subscribeLocalNotifications, type LocalNotification } from '@/services/local/local-notifications'

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
          <CutoutBrandMark className="size-6 text-foreground" />
          <span className="truncate">Cutout</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="flex flex-col items-center gap-1 py-4">
          <CutoutBrandMark label="Cutout" className="size-10 text-foreground" />
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
        <DropdownMenuItem onSelect={() => openSettings()}>
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
  const [notifications, setNotifications] = useState<readonly LocalNotification[]>(loadLocalNotifications)
  useEffect(() => subscribeLocalNotifications(() => setNotifications(loadLocalNotifications())), [])
  const unread = notifications.filter((notification) => !notification.read).length

  return (
    <DropdownMenu onOpenChange={(open) => { if (open && unread) setNotifications(markLocalNotificationsRead()) }}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={unread ? `${label} (${unread})` : label} className="relative">
              <Bell className="size-4" />
              {unread ? <span aria-hidden className="absolute right-1 top-1 size-1.5 rounded-full bg-destructive" /> : null}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>{label}</span>
          {notifications.length ? <button type="button" className="text-xs font-normal text-muted-foreground hover:text-foreground" onClick={() => { clearLocalNotifications(); setNotifications([]) }}>Clear</button> : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length ? (
          <div className="max-h-80 overflow-y-auto p-1">
            {notifications.map((notification) => <NotificationRow key={notification.id} notification={notification} />)}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 px-4 py-6 text-center">
            <Check className="size-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t({ id: 'home.notifications_empty', message: "You're all caught up" })}</p>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NotificationRow({ notification }: { readonly notification: LocalNotification }) {
  const Icon = notification.kind === 'success' ? CheckCircle2 : notification.kind === 'failure' ? TriangleAlert : CircleAlert
  const tone = notification.kind === 'success' ? 'text-emerald-600' : notification.kind === 'failure' ? 'text-destructive' : 'text-amber-600'
  return (
    <div className="flex gap-2 rounded-md px-2 py-2.5" data-notification-kind={notification.kind}>
      <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} />
      <div className="min-w-0">
        <p className="text-sm font-medium">{notification.title}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{notification.detail}</p>
      </div>
    </div>
  )
}
