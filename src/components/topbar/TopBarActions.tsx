/**
 * TopBarActions (spec §4c) — Import · Rerun · Export all, each with a tooltip
 * carrying its shortcut (the app's discoverability story, since there's no cmdk).
 *
 * Import and Export are self-contained (shared hooks); Rerun is injected from
 * AppShell because it needs the analysis bridge trigger. Buttons disable when
 * they'd be no-ops (no source / no slices / export in flight).
 */
import {
  ChevronDown,
  DownloadCloud,
  FileType,
  Layers,
  RefreshCw,
} from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useExport } from '@/hooks/useExport'
import { useSource, useSlices } from '@/store/selectors'
import { cn } from '@/lib/utils'

export interface TopBarActionsProps {
  readonly onRerun: () => void
}

export function TopBarActions({ onRerun }: TopBarActionsProps) {
  const { t } = useLingui()
  const {
    exportAll,
    exportAllPending,
    exportSvgPending,
    exportSvgLocal,
    exportSvgApi,
    exportPngAndSvgLocal,
    exportPngAndSvgApi,
  } = useExport()
  const hasSource = useSource().bitmap !== null
  const sliceCount = useSlices().length
  const exportDisabled = exportAllPending || exportSvgPending

  return (
    <div className="flex items-center gap-1.5">
      {hasSource ? (
        <ActionButton
          label={t({ id: 'topbar.rerun_label', message: 'Rerun analysis' })}
          shortcut="⌘R"
          variant="ghost"
          onClick={onRerun}
        >
          <RefreshCw />
          <Trans id="topbar.rerun_button">Rerun</Trans>
        </ActionButton>
      ) : null}

      {sliceCount > 0 ? (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  disabled={exportDisabled}
                  aria-label={t({
                    id: 'topbar.export_all_label',
                    message: 'Export all slices',
                  })}
                >
                  <DownloadCloud />
                  <Trans id="topbar.export_all_button">Export all</Trans>
                  <ChevronDown data-icon="inline-end" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="flex items-center gap-2">
              <span>
                <Trans id="topbar.export_all_label">Export all slices</Trans>
              </span>
              <kbd
                className={cn(
                  'rounded border border-border/60 bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground',
                )}
              >
                ⌘⇧E
              </kbd>
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <Trans id="export.menu_label">Export format</Trans>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={exportAll}>
              <DownloadCloud />
              <Trans id="export.menu_png">PNG slices</Trans>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={exportSvgLocal}>
              <FileType />
              <Trans id="export.menu_svg_local">SVG · Local</Trans>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={exportSvgApi}>
              <FileType />
              <Trans id="export.menu_svg_api">SVG · API</Trans>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={exportPngAndSvgLocal}>
              <Layers />
              <Trans id="export.menu_png_svg_local">PNG + SVG · Local</Trans>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={exportPngAndSvgApi}>
              <Layers />
              <Trans id="export.menu_png_svg_api">PNG + SVG · API</Trans>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}

interface ActionButtonProps {
  readonly label: string
  readonly shortcut: string
  readonly variant: 'default' | 'outline' | 'ghost'
  readonly disabled?: boolean
  readonly onClick: () => void
  readonly children: React.ReactNode
}

function ActionButton({
  label,
  shortcut,
  variant,
  disabled,
  onClick,
  children,
}: ActionButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          variant={variant}
          disabled={disabled}
          aria-label={`${label} (${shortcut})`}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">
        <span>{label}</span>
        <kbd
          className={cn(
            'rounded border border-border/60 bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground',
          )}
        >
          {shortcut}
        </kbd>
      </TooltipContent>
    </Tooltip>
  )
}
