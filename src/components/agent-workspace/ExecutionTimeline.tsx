import { Ban, Check, ChevronRight, Circle, CircleCheck, CircleX, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ExecutionStatus, ExecutionTimeline as ExecutionTimelineModel, ExecutionTimelineTool } from './execution-timeline'

export function ExecutionTimeline({ timeline, now, onApprove, onDeny }: {
  readonly timeline: ExecutionTimelineModel
  readonly now: number
  readonly onApprove?: (toolCallId: string, requestId: string) => void
  readonly onDeny?: (toolCallId: string, requestId: string) => void
}) {
  return (
    <section aria-label="Execution timeline" data-slot="execution-timeline" className="px-3 pb-3">
      <ol className="space-y-1.5">
        {timeline.steps.map((step) => {
          const open = step.status === 'running' || step.status === 'waiting' || step.status === 'failed'
          return (
            <li key={step.id}>
              <details open={open} className="group rounded-xl border border-border/70 bg-muted/45 px-3 py-2.5">
                <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                  <StatusIcon status={step.status} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{step.label}</span>
                  <Elapsed start={step.startedAt} end={step.endedAt ?? (open ? now : step.startedAt)} />
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                </summary>
                <div className="ml-1.5 mt-2 border-l border-border/70 pl-3.5">
                  {step.detail ? <p className="mb-2 text-xs leading-4 text-muted-foreground">{step.detail}</p> : null}
                  <ol className="space-y-2">
                    {step.tools.map((tool) => (
                      <ToolRow
                        key={tool.id}
                        tool={tool}
                        now={now}
                        showElapsed={step.tools.length > 1}
                        onApprove={onApprove}
                        onDeny={onDeny}
                      />
                    ))}
                  </ol>
                </div>
              </details>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function ToolRow({ tool, now, showElapsed, onApprove, onDeny }: { readonly tool: ExecutionTimelineTool; readonly now: number; readonly showElapsed: boolean; readonly onApprove?: (toolCallId: string, requestId: string) => void; readonly onDeny?: (toolCallId: string, requestId: string) => void }) {
  return (
    <li className="text-xs">
      <div className="flex items-center gap-2">
        <StatusIcon status={tool.status} small />
        <span className="min-w-0 flex-1 truncate text-foreground/90">{tool.label}</span>
        {showElapsed ? <Elapsed start={tool.startedAt} end={tool.endedAt ?? now} /> : null}
      </div>
      {(tool.route || tool.receiptId || tool.outputRefs.length || tool.policy || tool.detail) ? (
        <details className="ml-5 mt-1 text-[11px] text-muted-foreground">
          <summary className="cursor-pointer">Technical details</summary>
          <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5">
            {tool.detail ? <><dt>Status</dt><dd className="break-words">{tool.detail}</dd></> : null}
            {tool.route ? <><dt>Route</dt><dd className="break-all">{tool.route}</dd></> : null}
            {tool.policy ? <><dt>Policy</dt><dd className="break-words">{tool.policy}</dd></> : null}
            {tool.receiptId ? <><dt>Receipt</dt><dd className="break-all">{tool.receiptId}</dd></> : null}
            {tool.outputRefs.length ? <><dt>Outputs</dt><dd className="break-all">{tool.outputRefs.join(', ')}</dd></> : null}
          </dl>
        </details>
      ) : null}
      {tool.approval && onApprove && onDeny ? (
        <div className="ml-5 mt-2 flex gap-1.5">
          <Button size="sm" onClick={() => onApprove(tool.approval!.toolCallId, tool.approval!.requestId)}><Check /> Approve</Button>
          <Button size="sm" variant="outline" onClick={() => onDeny(tool.approval!.toolCallId, tool.approval!.requestId)}><Ban /> Deny</Button>
        </div>
      ) : null}
    </li>
  )
}

function Elapsed({ start, end }: { readonly start: number; readonly end: number }) {
  const seconds = Math.max(0, Math.floor((end - start) / 1000))
  return <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>
}

function StatusIcon({ status, small = false }: { readonly status: ExecutionStatus; readonly small?: boolean }) {
  const cls = small ? 'size-3' : 'size-3.5'
  if (status === 'running') return <LoaderCircle aria-label="Running" className={`${cls} shrink-0 animate-spin text-muted-foreground`} />
  if (status === 'waiting') return <Circle aria-label="Waiting" className={`${cls} shrink-0 text-muted-foreground`} />
  if (status === 'succeeded') return <CircleCheck aria-label="Completed" className={`${cls} shrink-0 text-emerald-500`} />
  if (status === 'failed') return <CircleX aria-label="Failed" className={`${cls} shrink-0 text-destructive`} />
  return <Ban aria-label="Cancelled" className={`${cls} shrink-0 text-muted-foreground`} />
}
