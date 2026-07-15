import { useEffect, useState, type ReactNode } from 'react'
import { Boxes, ChevronRight, File as FileGeneric, FileImage, Files, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

/** A previewable deliverable file (design system reference, prototype page, or cutout slice). */
export interface FilesPanelFileNode {
  readonly kind: 'file'
  readonly id: string
  readonly name: string
  readonly blob: Blob
  readonly width: number
  readonly height: number
}

/** A deliverable that has been approved but not yet saved to the Library — no manifest exists yet. */
export interface FilesPanelReceiptNode {
  readonly kind: 'receipt'
  readonly id: string
  readonly name: string
  readonly receiptKind: string
  readonly contentSha256: string
}

/**
 * One real, content-addressed artifact from a saved Library item's manifest
 * (`GlobalLibraryItem.content.artifacts`) — a genuine relative path + hash
 * the catalog is tracking, not a fabricated file. No bytes are stored
 * alongside the manifest, so there is no live preview, only provenance.
 */
export interface FilesPanelArtifactNode {
  readonly kind: 'artifact'
  readonly id: string
  readonly name: string
  readonly mediaType: string
  readonly size: number
  readonly sha256: string
}

/** A folder grouping files, receipts, artifacts, or nested folders (e.g. an artifact's path segments). */
export interface FilesPanelFolderNode {
  readonly kind: 'folder'
  readonly id: string
  readonly name: string
  readonly children: readonly FilesPanelNode[]
  readonly defaultOpen?: boolean
}

export type FilesPanelNode =
  | FilesPanelFileNode
  | FilesPanelReceiptNode
  | FilesPanelArtifactNode
  | FilesPanelFolderNode

export interface FilesPanelProps {
  readonly nodes: readonly FilesPanelNode[]
  readonly selectedId?: string | null
  readonly onSelectFile?: (id: string) => void
  readonly className?: string
}

function countLeaves(nodes: readonly FilesPanelNode[]): number {
  return nodes.reduce(
    (total, node) => total + (node.kind === 'folder' ? countLeaves(node.children) : 1),
    0,
  )
}

/**
 * Docked file tree of everything the Agent has produced for this project —
 * design system reference, prototype pages, cutout slices, and approved
 * (content-hashed) deliverable receipts. Click a file to focus it on canvas.
 * The tree shape is generic so new deliverable kinds (kits, components,
 * starters) can be added as more folders without changing this component.
 */
export function FilesPanel({ nodes, selectedId = null, onSelectFile, className }: FilesPanelProps) {
  const total = countLeaves(nodes)

  return (
    <aside
      aria-label="Files"
      data-slot="files-panel"
      className={cn('flex min-h-0 flex-col bg-background text-foreground', className)}
    >
      <header className="shrink-0 border-b border-border px-3 py-3">
        <div className="flex items-center gap-2">
          <Files aria-hidden="true" className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Files</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {total > 0
            ? `${total} deliverable${total === 1 ? '' : 's'} from this project`
            : 'What the Agent produces will collect here.'}
        </p>
      </header>

      {total === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <FileImage aria-hidden="true" className="size-8 text-muted-foreground/50" />
          <p className="text-sm font-medium">No files yet</p>
          <p className="text-xs text-muted-foreground">
            Design system, pages, and cutout slices will appear here as the Agent delivers them.
          </p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {nodes.map((node) => (
            <TreeNode key={node.id} node={node} depth={0} selectedId={selectedId} onSelectFile={onSelectFile} />
          ))}
        </ul>
      )}
    </aside>
  )
}

function TreeNode({
  node,
  depth,
  selectedId,
  onSelectFile,
}: {
  readonly node: FilesPanelNode
  readonly depth: number
  readonly selectedId: string | null
  readonly onSelectFile?: (id: string) => void
}) {
  if (node.kind === 'folder') {
    return (
      <FolderRow name={node.name} count={countLeaves(node.children)} defaultOpen={node.defaultOpen} depth={depth}>
        {node.children.map((child) => (
          <TreeNode key={child.id} node={child} depth={depth + 1} selectedId={selectedId} onSelectFile={onSelectFile} />
        ))}
      </FolderRow>
    )
  }
  if (node.kind === 'receipt') return <ReceiptRow node={node} depth={depth} />
  if (node.kind === 'artifact') return <ArtifactRow node={node} depth={depth} />
  return (
    <FileRow
      node={node}
      depth={depth}
      selected={selectedId === node.id}
      onClick={onSelectFile ? () => onSelectFile(node.id) : undefined}
    />
  )
}

function FolderRow({
  name,
  count,
  defaultOpen = false,
  depth,
  children,
}: {
  readonly name: string
  readonly count: number
  readonly defaultOpen?: boolean
  readonly depth: number
  readonly children: ReactNode
}) {
  return (
    <li>
      <details open={defaultOpen} className="group/files-folder border-b border-border last:border-b-0">
        <summary
          className="sticky top-0 z-10 flex cursor-pointer list-none items-center gap-2 bg-background px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden"
          style={{ paddingLeft: `${0.75 + depth * 0.75}rem` }}
        >
          <ChevronRight className="size-3.5 shrink-0 transition-transform group-open/files-folder:rotate-90" />
          <span className="truncate">{name}</span>
          <span className="ml-auto shrink-0 tabular-nums">{count}</span>
        </summary>
        <ul className="pb-1">{children}</ul>
      </details>
    </li>
  )
}

function FileRow({
  node,
  depth,
  selected,
  onClick,
}: {
  readonly node: FilesPanelFileNode
  readonly depth: number
  readonly selected: boolean
  readonly onClick?: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const next = URL.createObjectURL(node.blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [node.blob])

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        aria-current={selected}
        style={{ paddingLeft: `${0.75 + depth * 0.75}rem` }}
        className={cn(
          'flex w-full min-w-0 items-center gap-2 py-1.5 pr-3 text-left text-xs transition-colors',
          selected ? 'bg-muted text-foreground' : 'text-foreground/90 hover:bg-muted/60',
          !onClick && 'cursor-default opacity-70',
        )}
      >
        <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40">
          {url ? <img src={url} alt="" className="size-full object-cover" /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{node.name}</span>
          <span className="block truncate text-[11px] text-muted-foreground tabular-nums">
            {node.width}×{node.height}
          </span>
        </span>
      </button>
    </li>
  )
}

function ReceiptRow({ node, depth }: { readonly node: FilesPanelReceiptNode; readonly depth: number }) {
  return (
    <li>
      <details className="group/receipt" style={{ paddingLeft: `${0.75 + depth * 0.75}rem`, paddingRight: '0.75rem' }}>
        <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2 py-1.5 text-xs [&::-webkit-details-marker]:hidden">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
            <Boxes aria-hidden="true" className="size-3.5 text-muted-foreground" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{node.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{node.receiptKind}</span>
          </span>
          <ShieldCheck aria-hidden="true" className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        </summary>
        <p className="truncate pb-2 pl-9 font-mono text-[10px] text-muted-foreground" title={node.contentSha256}>
          sha256:{node.contentSha256.slice(0, 16)}…
        </p>
      </details>
    </li>
  )
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function ArtifactRow({ node, depth }: { readonly node: FilesPanelArtifactNode; readonly depth: number }) {
  return (
    <li>
      <details className="group/artifact" style={{ paddingLeft: `${0.75 + depth * 0.75}rem`, paddingRight: '0.75rem' }}>
        <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2 py-1.5 text-xs [&::-webkit-details-marker]:hidden">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
            {node.mediaType.startsWith('image/') ? (
              <FileImage aria-hidden="true" className="size-3.5 text-muted-foreground" />
            ) : (
              <FileGeneric aria-hidden="true" className="size-3.5 text-muted-foreground" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{node.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{formatBytes(node.size)}</span>
          </span>
        </summary>
        <p className="truncate pb-2 pl-9 font-mono text-[10px] text-muted-foreground" title={node.sha256}>
          sha256:{node.sha256.slice(0, 16)}…
        </p>
      </details>
    </li>
  )
}
