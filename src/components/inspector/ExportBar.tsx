/**
 * ExportBar (spec §4c) — per-slice export plus an export-all mirror.
 *
 * Both buttons drive the same Query mutations (via `useExport`), so their
 * `isPending` states and toasts match the TopBar. The single-slice button is
 * primary here because the inspector is slice-focused; export-all is the calmer
 * secondary mirror.
 */
import { ChevronDown, Download, DownloadCloud, FileType } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useExport } from '@/hooks/useExport'
import { useSlices } from '@/store/selectors'
import type { Slice } from '@/store/types'

export interface ExportBarProps {
  readonly slice: Slice
}

export function ExportBar({ slice }: ExportBarProps) {
  const { t } = useLingui()
  const {
    exportOne,
    exportAll,
    exportOnePending,
    exportAllPending,
    exportOneSvgLocal,
    exportOneSvgApi,
    exportSvgPending,
  } = useExport()
  const total = useSlices().filter((item) => item.included).length
  const exportSliceDisabled = exportOnePending || exportSvgPending || !slice.included

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="flex-1"
            size="sm"
            disabled={exportSliceDisabled}
            title={t({
              id: 'inspector.export_slice',
              message: 'Export slice',
            })}
          >
            <Download />
            <Trans id="inspector.export_slice">Export slice</Trans>
            <ChevronDown data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuItem onSelect={() => exportOne(slice.id)}>
            <Download />
            <Trans id="export.menu_png">PNG slices</Trans>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => exportOneSvgLocal(slice.id)}>
            <FileType />
            <Trans id="export.menu_svg_local">SVG · Local</Trans>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => exportOneSvgApi(slice.id)}>
            <FileType />
            <Trans id="export.menu_svg_api">SVG · API</Trans>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="outline"
        size="sm"
        disabled={exportAllPending || total === 0}
        onClick={exportAll}
        title={t({
          id: 'inspector.export_all_tooltip',
          message: 'Export all slices',
        })}
      >
        <DownloadCloud />
        <Trans id="inspector.export_all_button">All ({total})</Trans>
      </Button>
    </div>
  )
}
