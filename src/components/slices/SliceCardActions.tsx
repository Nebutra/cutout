/**
 * SliceCardActions (spec §4c) — hover row: Export · Rename · Copy PNG.
 *
 * Rendered inside a card; buttons stopPropagation so they don't also toggle
 * selection. Export/Copy act on this slice directly; Rename selects it and
 * fires a rename intent the inspector's name field answers.
 */
import { Download, FileType, Pencil, Copy } from 'lucide-react'
import { useLingui } from '@lingui/react/macro'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useStore } from '@/store'
import { requestRename } from '@/hooks/useRenameIntent'
import { useCopyPng } from '@/hooks/useCopyPng'
import { useExport } from '@/hooks/useExport'
import type { Slice } from '@/store/types'

export interface SliceCardActionsProps {
  readonly slice: Slice
}

export function SliceCardActions({ slice }: SliceCardActionsProps) {
  const { t } = useLingui()
  const selectSlice = useStore((s) => s.selectSlice)
  const copyPng = useCopyPng()
  const {
    exportOne,
    exportOnePending,
    exportOneSvgLocal,
    exportOneSvgApi,
    exportSvgPending,
  } = useExport()

  return (
    <div
      className="absolute inset-x-1 bottom-1 flex items-center justify-center gap-0.5 rounded-md border border-border/60 bg-background/90 p-0.5 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover/card:opacity-100 focus-within:opacity-100"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={exportOnePending || exportSvgPending}
            aria-label={t({
              id: 'slices.action_export',
              message: 'Export slice',
            })}
            title={t({ id: 'slices.action_export', message: 'Export slice' })}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Download />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="w-40">
          <DropdownMenuItem onSelect={() => exportOne(slice.id)}>
            <Download />
            PNG
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => exportOneSvgLocal(slice.id)}>
            <FileType />
            SVG · Local
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => exportOneSvgApi(slice.id)}>
            <FileType />
            SVG · API
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Action
        label={t({ id: 'slices.action_rename', message: 'Rename' })}
        onClick={() => {
          selectSlice(slice.id)
          requestRename(slice.id)
        }}
      >
        <Pencil />
      </Action>
      <Action
        label={t({ id: 'slices.action_copy_png', message: 'Copy PNG' })}
        onClick={() => void copyPng(slice.blob, slice.name)}
      >
        <Copy />
      </Action>
    </div>
  )
}

interface ActionProps {
  readonly label: string
  readonly disabled?: boolean
  readonly onClick: () => void
  readonly children: React.ReactNode
}

function Action({ label, disabled, onClick, children }: ActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={disabled}
          aria-label={label}
          onClick={(event) => {
            event.stopPropagation()
            onClick()
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
