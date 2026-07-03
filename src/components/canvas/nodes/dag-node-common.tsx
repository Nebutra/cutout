/**
 * Shared chrome for PLANNED graph nodes (spec §6/§E). A planned node reads its
 * live state from the store's `dagNodes[id]` (the Executor's sink) and renders a
 * calm, opaque {@link NodeShell} with an op badge, the planner's label, and a
 * compact preview of whatever it produced (a style/mockup image thumbnail, a
 * slice count, or a naming count). Kept dumb + presentational so both the
 * generic {@link DagNode} and the {@link DesignSystemNode} share one look.
 */
import { useEffect, useMemo, useState } from 'react'
import { ImageOff, Loader2 } from 'lucide-react'
import { Trans } from '@lingui/react/macro'
import type { NodeOp } from '@/dag/graph-spec'
import type { DagNodeState } from '@/store/types'
import { bytesToBlob } from '@/lib/image'

/** The op badge — explicit per op so Lingui extracts each static id. */
export function OpBadge({ op }: { readonly op: NodeOp }) {
  switch (op) {
    case 'generate-image':
      return <Trans id="dag.op_design_system">Design system</Trans>
    case 'edit-image':
      return <Trans id="dag.op_mockup">Mockup</Trans>
    case 'deconstruct':
      return <Trans id="dag.op_board">Asset board</Trans>
    case 'cutout':
      return <Trans id="dag.op_cutout">Slices</Trans>
    default:
      return <Trans id="dag.op_name">Naming</Trans>
  }
}

/** An object URL for image-kind output bytes, created + revoked as they change. */
function useOutputImageUrl(state: DagNodeState | undefined): string | null {
  const bytes =
    state?.status === 'done' && state.output?.kind === 'image'
      ? state.output.bytes
      : null
  const blob = useMemo(() => (bytes ? bytesToBlob(bytes, 'image/png') : null), [bytes])
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}

/** The state-driven body: image thumbnail · counts · spinner · error · blocked. */
export function DagNodePreview({ state }: { readonly state: DagNodeState | undefined }) {
  const url = useOutputImageUrl(state)
  const status = state?.status ?? 'idle'

  return (
    <div className="flex h-40 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/30 p-2 text-center text-xs text-muted-foreground">
      {url ? (
        <img src={url} alt="" className="max-h-full max-w-full object-contain" />
      ) : status === 'running' ? (
        <span className="flex flex-col items-center gap-2">
          <Loader2 className="size-5 animate-spin" />
          <Trans id="dag.running">Running…</Trans>
        </span>
      ) : status === 'error' ? (
        <span className="text-destructive">{state?.error}</span>
      ) : status === 'blocked' ? (
        <Trans id="dag.blocked">Blocked — an upstream step failed.</Trans>
      ) : state?.status === 'done' && state.output?.kind === 'slices' ? (
        <Trans id="dag.slices_count">{state.output.slices.length} slices cut</Trans>
      ) : state?.status === 'done' && state.output?.kind === 'names' ? (
        <Trans id="dag.names_count">{state.output.names.length} slices named</Trans>
      ) : (
        <span className="flex flex-col items-center gap-2">
          <ImageOff className="size-5 opacity-70" />
          <Trans id="dag.idle">Waiting to run…</Trans>
        </span>
      )}
    </div>
  )
}
