/**
 * TabsMenu — Figma-style tabs overview pinned at the TopBar's right edge.
 * A popover panel with a search field (⇧⌘Y), the tabs open in this window
 * (closable inline), and recently closed project tabs one click from reopening.
 */
import { useEffect, useMemo, useState } from 'react'
import { AppWindow, History, Home, Scissors, Search, X } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface ClosedTab {
  readonly id: string
  readonly name: string
}

export interface TabsMenuProps {
  readonly view: 'home' | 'project'
  readonly projectName: string
  readonly projectTabOpen: boolean
  readonly recentlyClosed: readonly ClosedTab[]
  readonly onOpenHome: () => void
  readonly onOpenProject: () => void
  readonly onCloseProject: () => void
  readonly onReopenTab: (id: string) => void
}

export function TabsMenu({
  view,
  projectName,
  projectTabOpen,
  recentlyClosed,
  onOpenHome,
  onOpenProject,
  onCloseProject,
  onReopenTab,
}: TabsMenuProps) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const label = t({ id: 'topbar.tabs_overview', message: 'Open tabs' })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const needle = query.trim().toLocaleLowerCase()
  const matches = (name: string) => !needle || name.toLocaleLowerCase().includes(needle)
  const showHome = matches('Home')
  const showProject = projectTabOpen && matches(projectName)
  const closedMatches = useMemo(
    () => recentlyClosed.filter((tab) => matches(tab.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recentlyClosed, needle],
  )
  const nothingMatches = !showHome && !showProject && !closedMatches.length

  const openAndClose = (action: () => void) => {
    action()
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={label}>
              <AppWindow className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="flex items-center gap-2">
          <span>{label}</span>
          <kbd className="rounded border border-border/60 bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
            ⇧⌘Y
          </kbd>
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t({ id: 'topbar.search_tabs', message: 'Search tabs' })}
            aria-label={t({ id: 'topbar.search_tabs', message: 'Search tabs' })}
            className="h-8 pl-8 pr-14 text-sm"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border/60 bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
            ⇧⌘Y
          </kbd>
        </div>

        {nothingMatches ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {needle
              ? t({ id: 'topbar.tabs_no_match', message: 'No matching tabs' })
              : t({
                  id: 'topbar.tabs_empty',
                  message: 'Your open tabs and recently closed tabs will appear here',
                })}
          </p>
        ) : (
          <>
            {showHome || showProject ? (
              <div className="mt-2">
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                  {t({ id: 'topbar.tabs_in_window', message: 'Tabs in this window' })}
                </p>
                {showHome ? (
                  <TabRow
                    icon={<Home className="size-3.5" />}
                    name="Home"
                    active={view === 'home'}
                    onSelect={() => openAndClose(onOpenHome)}
                  />
                ) : null}
                {showProject ? (
                  <TabRow
                    icon={<Scissors className="size-3.5" />}
                    name={projectName}
                    active={view === 'project'}
                    onSelect={() => openAndClose(onOpenProject)}
                    onClose={onCloseProject}
                  />
                ) : null}
              </div>
            ) : null}
            {closedMatches.length ? (
              <div className="mt-2">
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                  {t({ id: 'topbar.recently_closed', message: 'Recently closed' })}
                </p>
                {closedMatches.map((tab) => (
                  <TabRow
                    key={tab.id}
                    icon={<History className="size-3.5" />}
                    name={tab.name}
                    onSelect={() => openAndClose(() => onReopenTab(tab.id))}
                  />
                ))}
              </div>
            ) : null}
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}

function TabRow({
  icon,
  name,
  active = false,
  onSelect,
  onClose,
}: {
  readonly icon: React.ReactNode
  readonly name: string
  readonly active?: boolean
  readonly onSelect: () => void
  readonly onClose?: () => void
}) {
  return (
    <div
      className={cn(
        'group flex items-center rounded-md text-sm transition-colors',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      <button
        type="button"
        aria-current={active ? 'true' : undefined}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onSelect}
      >
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{name}</span>
      </button>
      {onClose ? (
        <button
          type="button"
          aria-label={`Close ${name}`}
          className="mr-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-background/80 hover:text-foreground group-hover:opacity-100"
          onClick={onClose}
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  )
}
