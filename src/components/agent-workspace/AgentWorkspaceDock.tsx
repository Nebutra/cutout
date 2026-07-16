import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronRight,
  CircleStop,
  Clock3,
  FileCheck2,
  Globe2,
  LoaderCircle,
  Paperclip,
  Pause,
  Play,
  RefreshCw,
  Send,
  Sparkles,
  Wrench,
  X,
  ChevronDown,
  BrainCircuit,
  Bot,
  BadgeDollarSign,
  Ban,
  ReceiptText,
  Copy,
  Pencil,
  CheckCheck,
} from 'lucide-react'
import type {
  AgentFeedItem,
  AgentRunSummary,
  AgentWorkspaceViewModel,
  OutcomeChecklistItem,
} from './agent-view-model'
import { deriveDockPresentation } from './dock-presentation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ConnectorMenu } from '@/components/integrations/ConnectorMenu'

export interface AgentComposerChoice {
  readonly value: string
  readonly label: string
  readonly description?: string
}

export interface AgentComposerSelection {
  readonly value: string
  readonly options: readonly AgentComposerChoice[]
  readonly disabled?: boolean
  readonly onChange: (value: string) => void
}

export interface AgentComposerWebSearch {
  readonly enabled: boolean
  readonly disabled?: boolean
  readonly onChange: (enabled: boolean) => void
}

export interface AgentComposerModel {
  readonly value: string
  readonly placeholder?: string
  readonly disabled?: boolean
  readonly busy?: boolean
  readonly submitDisabled?: boolean
  /** True when an empty composer value is still a valid submission (e.g. a human-loop question already has a selected/default choice; typed text is optional extra context). */
  readonly allowEmptySubmit?: boolean
  readonly attachments?: readonly { readonly id: string; readonly label: string; readonly mediaType?: string; readonly previewUrl?: string; readonly status?: string }[]
  readonly onChange: (value: string) => void
  readonly onSubmit: () => void
  readonly onStop?: () => void
  readonly onAttach?: () => void
  readonly onRemoveAttachment?: (id: string) => void
  readonly webSearch?: AgentComposerWebSearch
  readonly modelSelection?: AgentComposerSelection
  readonly thinkingSelection?: AgentComposerSelection
  readonly materialContext?: {
    readonly label: string
    readonly detail: string
    readonly blockedReason?: string | null
    readonly onClear: () => void
  }
}

export interface AgentDockLabels {
  readonly feed: string
  readonly outcomes: string
  readonly controls: string
  readonly pause: string
  readonly resume: string
  readonly cancel: string
  readonly retry: string
  readonly send: string
  readonly stop: string
  readonly attach: string
  readonly toolDetails: string
  readonly noActivity: string
  readonly preservedResults: string
  readonly recoveryHint: string
  readonly webSearch: string
  readonly model: string
  readonly thinking: string
  readonly running: string
  readonly budget: string
}

export interface AgentWorkspaceDockProps {
  readonly viewModel: AgentWorkspaceViewModel
  readonly composer: AgentComposerModel
  /** Human-in-the-loop choice or approval surface, kept visible above run controls. */
  readonly intervention?: ReactNode
  readonly mode?: 'dock' | 'sheet' | 'inline'
  readonly compact?: boolean
  readonly className?: string
  readonly labels?: Partial<AgentDockLabels>
  readonly onPause?: () => void
  readonly onResume?: () => void
  readonly onCancel?: () => void
  readonly onRetry?: () => void
  readonly onOpenArtifact?: (id: string) => void
  readonly onApproveTool?: (toolCallId: string, requestId: string) => void
  readonly onDenyTool?: (toolCallId: string, requestId: string) => void
  readonly onCancelTool?: (toolCallId: string, requestId?: string) => void
  readonly onRetryTool?: (toolCallId: string, requestId?: string) => void
  readonly onAgentAction?: (eventId: string, action: 'proceed-anyway', brief: string) => void
  readonly onEditMessage?: (message: string) => void
  readonly onOpenBudget?: () => void
  /** Cost disclosure is transactional, not permanent workspace chrome. */
  readonly showCostNotice?: boolean
}

const DEFAULT_LABELS: AgentDockLabels = {
  feed: 'Agent activity',
  outcomes: 'Outcome checklist',
  controls: 'Run controls',
  pause: 'Pause',
  resume: 'Resume',
  cancel: 'Cancel',
  retry: 'Repair and retry',
  send: 'Send',
  stop: 'Stop',
  attach: 'Attach reference',
  toolDetails: 'Execution details',
  noActivity: 'Activity will appear here as the Agent works.',
  preservedResults: 'Completed materials are preserved.',
  recoveryHint: 'Repair missing outcomes or start a new run when ready.',
  webSearch: 'Web search',
  model: 'Model',
  thinking: 'Thinking',
  running: 'Agent running',
  budget: 'Budget',
}

export function AgentWorkspaceDock({
  viewModel,
  composer,
  intervention,
  mode = 'dock',
  compact = false,
  className,
  labels: labelOverrides,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onOpenArtifact,
  onApproveTool,
  onDenyTool,
  onCancelTool,
  onRetryTool,
  onAgentAction,
  onEditMessage,
  onOpenBudget,
  showCostNotice = false,
}: AgentWorkspaceDockProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides }
  const presentation = deriveDockPresentation(viewModel, {
    hasIntervention: Boolean(intervention),
  })
  // The composer owns the active-run stop action. Do not render a second,
  // visually disconnected cancel button for the same operation.
  const runCancel = composer.onStop ? undefined : onCancel
  const gateItems = viewModel.feed.filter((item) => item.type === 'tool' && item.status === 'waiting')
  const conversationItems = viewModel.feed.filter((item) => item.type === 'message')
  // Ops activity only — conversation messages are the primary surface, not "Details".
  const activityItems = viewModel.feed.filter(
    (item) => item.type !== 'message' && !(item.type === 'tool' && item.status === 'waiting'),
  )
  const hasActivity = activityItems.length > 0
  const hasRunDetails = hasActivity || presentation.showChecklist

  return (
    <aside
      aria-label="Agent workspace"
      data-mode={mode}
      className={cn(
        'flex min-h-0 flex-col bg-background text-foreground',
        mode === 'dock' && 'h-full w-full border-l border-border sm:min-w-72 sm:max-w-[23rem]',
        mode === 'sheet' && 'h-full w-full',
        mode === 'inline' && 'min-h-[36rem] w-full border border-border',
        className,
      )}
    >
      {presentation.showOverview ? (
        <RunOverview summary={viewModel.summary} compact={compact} />
      ) : null}

      {gateItems.length > 0 ? (
        <AgentRunFeed
          items={gateItems}
          emptyLabel={labels.noActivity}
          detailsLabel={labels.toolDetails}
          heading="Decision needed"
          compact
          onApproveTool={onApproveTool}
          onDenyTool={onDenyTool}
          onCancelTool={onCancelTool}
          onRetryTool={onRetryTool}
          onAgentAction={onAgentAction}
        />
      ) : null}

      {conversationItems.length > 0 ? (
        <div
          data-slot="agent-conversation"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-b border-border"
        >
          <AgentRunFeed
            items={conversationItems}
            emptyLabel={labels.noActivity}
            detailsLabel={labels.toolDetails}
            heading="Conversation"
            compact
            onAgentAction={onAgentAction}
            onEditMessage={onEditMessage}
          />
        </div>
      ) : null}

      {!hasRunDetails ? (
        conversationItems.length === 0 ? (
          <div aria-hidden="true" data-slot="agent-draft-spacer" className="min-h-8 flex-1" />
        ) : null
      ) : (
        <details data-slot="agent-details" className="group/details shrink-0 overflow-y-auto overscroll-contain border-b border-border">
          <summary className="sticky top-0 z-10 flex cursor-pointer list-none items-center gap-2 bg-background px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3.5 transition-transform group-open/details:rotate-90" />
            Details
            {viewModel.checklist.length > 0 ? (
              <span className="ml-auto tabular-nums">{viewModel.checklist.filter((item) => item.status === 'complete').length}/{viewModel.checklist.length}</span>
            ) : null}
          </summary>
          {hasActivity ? (
            <AgentRunFeed
              items={activityItems}
              emptyLabel={labels.noActivity}
              detailsLabel={labels.toolDetails}
              heading={labels.feed}
              compact={compact}
              onApproveTool={onApproveTool}
              onDenyTool={onDenyTool}
              onCancelTool={onCancelTool}
              onRetryTool={onRetryTool}
              onAgentAction={onAgentAction}
            />
          ) : null}
          {presentation.showChecklist ? (
            <OutcomeChecklist
              items={viewModel.checklist}
              heading={labels.outcomes}
              onOpenArtifact={onOpenArtifact}
              compact={compact}
            />
          ) : null}
        </details>
      )}

      <div className="shrink-0 border-t border-border bg-background">
        {gateItems.length > 0 && viewModel.cost && (viewModel.cost.estimated.length > 0 || viewModel.cost.charged.length > 0) ? (
          <CostSummary cost={viewModel.cost} onOpenBudget={onOpenBudget} label={labels.budget} />
        ) : null}
        {presentation.showIntervention ? (
          <div className="border-b border-border px-3 py-2.5">{intervention}</div>
        ) : null}
        {presentation.showControls ? (
          <AgentRunControls
            summary={viewModel.summary}
            heading={labels.controls}
            labels={labels}
            onPause={onPause}
            onResume={onResume}
            onCancel={runCancel}
            onRetry={onRetry}
            compact={compact}
          />
        ) : null}
        {showCostNotice && gateItems.length > 0 ? (
          <p className="border-t border-border px-3 py-2 text-[11px] leading-4 text-muted-foreground">
            {viewModel.costNotice}
          </p>
        ) : null}
        <AgentComposer model={composer} labels={labels} compact={compact} />
      </div>
    </aside>
  )
}

export function RunOverview({
  summary,
  compact = false,
}: {
  readonly summary: AgentRunSummary
  readonly compact?: boolean
}) {
  const isRunning = summary.status === 'running'
  return (
    <header data-slot="agent-run-overview" className={cn('shrink-0 border-b border-border', compact ? 'px-3 py-2.5' : 'px-3 py-3')}>
      <div className="flex items-start gap-2.5">
        <StatusMark status={summary.status} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h2 className="truncate text-sm font-semibold">{summary.title}</h2>
            {summary.elapsedLabel ? (
              <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
                <Clock3 className="size-3" />
                {summary.elapsedLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{summary.detail}</p>
          {summary.intent ? (
            <p className="mt-1.5 line-clamp-2 break-words text-xs leading-4" title={summary.intent}>
              {summary.intent}
            </p>
          ) : null}
        </div>
      </div>
      {isRunning ? (
        <div
          aria-label="Agent is running"
          className="mt-2 h-0.5 overflow-hidden bg-muted"
        >
          <div className="h-full w-2/5 animate-pulse rounded-full bg-primary" />
        </div>
      ) : null}
    </header>
  )
}

export function AgentRunFeed({
  items,
  heading,
  emptyLabel,
  detailsLabel,
  compact = false,
  onApproveTool,
  onDenyTool,
  onCancelTool,
  onRetryTool,
  onAgentAction,
  onEditMessage,
}: {
  readonly items: readonly AgentFeedItem[]
  readonly heading: string
  readonly emptyLabel: string
  readonly detailsLabel: string
  readonly compact?: boolean
  readonly onApproveTool?: AgentWorkspaceDockProps['onApproveTool']
  readonly onDenyTool?: AgentWorkspaceDockProps['onDenyTool']
  readonly onCancelTool?: AgentWorkspaceDockProps['onCancelTool']
  readonly onRetryTool?: AgentWorkspaceDockProps['onRetryTool']
  readonly onAgentAction?: AgentWorkspaceDockProps['onAgentAction']
  readonly onEditMessage?: AgentWorkspaceDockProps['onEditMessage']
}) {
  const endRef = useRef<HTMLDivElement | null>(null)
  const previousCountRef = useRef(items.length)

  useEffect(() => {
    if (items.length > previousCountRef.current) {
      endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
    previousCountRef.current = items.length
  }, [items.length])

  const isConversation = items.every((item) => item.type === 'message')

  return (
    <section
      data-slot="agent-run-feed"
      aria-labelledby="agent-feed-heading"
      className={cn(compact ? 'p-3' : 'px-3 py-3')}
    >
      {!isConversation ? <SectionHeading id="agent-feed-heading">{heading}</SectionHeading> : (
        <h2 id="agent-feed-heading" className="sr-only">{heading}</h2>
      )}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className={cn(isConversation ? 'mt-0 space-y-2.5' : 'mt-2 space-y-1')}
      >
        {items.length === 0 ? (
          <p className="max-w-[30ch] break-words py-2 text-xs leading-4 text-muted-foreground">{emptyLabel}</p>
        ) : items.map((item) => (
          <FeedRow key={item.id} item={item} detailsLabel={detailsLabel} onApproveTool={onApproveTool} onDenyTool={onDenyTool} onCancelTool={onCancelTool} onRetryTool={onRetryTool} onAgentAction={onAgentAction} onEditMessage={onEditMessage} />
        ))}
        <div ref={endRef} />
      </div>
    </section>
  )
}

function FeedRow({ item, detailsLabel, onApproveTool, onDenyTool, onCancelTool, onRetryTool, onAgentAction, onEditMessage }: {
  readonly item: AgentFeedItem
  readonly detailsLabel: string
  readonly onApproveTool?: AgentWorkspaceDockProps['onApproveTool']
  readonly onDenyTool?: AgentWorkspaceDockProps['onDenyTool']
  readonly onCancelTool?: AgentWorkspaceDockProps['onCancelTool']
  readonly onRetryTool?: AgentWorkspaceDockProps['onRetryTool']
  readonly onAgentAction?: AgentWorkspaceDockProps['onAgentAction']
  readonly onEditMessage?: AgentWorkspaceDockProps['onEditMessage']
}) {
  const isError = item.type === 'error'
  const tool = item.type === 'tool' ? item : null

  // Conversation turns: left/right chat bubbles (user right, agent left).
  if (item.type === 'message') {
    const isUser = item.role === 'user'
    const pending = item.status === 'pending'
    return (
      <div
        data-slot={isUser ? 'user-message' : 'agent-message'}
        className={cn('group/message flex w-full', isUser ? 'justify-end' : 'justify-start')}
      >
        <div className="max-w-[92%]">
          <article
            className={cn(
              'rounded-2xl px-3 py-2 text-sm leading-5',
              isUser
                ? 'rounded-br-md bg-primary text-primary-foreground'
                : 'rounded-bl-md bg-muted text-foreground',
            )}
          >
            {pending ? (
              <p role="status" className="flex items-center gap-2 text-muted-foreground">
                <LoaderCircle className="size-3.5 animate-spin" />
                <span>{item.detail}</span>
              </p>
            ) : (
              <p className="whitespace-pre-wrap break-words">{item.detail}</p>
            )}
          </article>
          {!pending ? (
            <MessageActions
              align={isUser ? 'end' : 'start'}
              message={item.detail}
              allowEdit={isUser && Boolean(onEditMessage)}
              onEdit={onEditMessage}
            />
          ) : null}
          {item.action && onAgentAction ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2 max-w-full"
              onClick={() => onAgentAction(item.id, item.action!.type, item.action!.brief)}
            >
              {item.action.label}
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <article
      className={cn(
        'group border-l-2 py-2 pl-3',
        isError ? 'border-destructive' : item.status === 'running' ? 'border-primary' : 'border-border',
      )}
    >
      <div className="flex items-start gap-2">
        <FeedIcon item={item} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs font-medium">{item.title}</p>
            <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
              {item.provenance}
            </span>
          </div>
          <details className="group/details mt-1 text-xs text-muted-foreground">
            <summary className="flex cursor-pointer list-none items-center gap-1 py-0.5 hover:text-foreground [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-3 transition-transform group-open/details:rotate-90" />
              {detailsLabel}
            </summary>
            <p className="mt-1 break-words pl-4 leading-5">{item.detail}</p>
            {tool ? (
              <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 pl-4 text-[11px] leading-4">
                {tool.providerModel ? <><dt>Route</dt><dd className="break-all text-foreground/80">{tool.providerModel}</dd></> : null}
                {tool.estimatedCost ? <><dt>Estimate</dt><dd>{formatMoney(tool.estimatedCost)}</dd></> : null}
                {tool.charged ? <><dt>Charged</dt><dd>{formatMoney(tool.charged)}</dd></> : null}
                {tool.approval ? <><dt>Policy</dt><dd>{tool.approval.status} · {tool.approval.reason}</dd></> : null}
                {tool.receiptId ? <><dt>Receipt</dt><dd className="break-all">{tool.receiptId}</dd></> : null}
                {tool.outputRefs?.length ? <><dt>Evidence</dt><dd className="break-all">{tool.outputRefs.join(', ')}</dd></> : null}
                {tool.retryOfRequestId ? <><dt>Retry of</dt><dd className="break-all">{tool.retryOfRequestId}</dd></> : null}
              </dl>
            ) : null}
          </details>
          {tool?.actions?.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tool.actions.includes('approve') && tool.requestId && onApproveTool ? <Button size="sm" onClick={() => onApproveTool(tool.toolCallId, tool.requestId!)}><Check /> Approve</Button> : null}
              {tool.actions.includes('deny') && tool.requestId && onDenyTool ? <Button size="sm" variant="outline" onClick={() => onDenyTool(tool.toolCallId, tool.requestId!)}><Ban /> Deny</Button> : null}
              {tool.actions.includes('cancel') && onCancelTool ? <Button size="sm" variant="outline" onClick={() => onCancelTool(tool.toolCallId, tool.requestId)}><CircleStop /> Cancel</Button> : null}
              {tool.actions.includes('retry') && onRetryTool ? <Button size="sm" variant="outline" onClick={() => onRetryTool(tool.toolCallId, tool.requestId)}><RefreshCw /> Retry</Button> : null}
            </div>
          ) : null}
          {isError ? (
            <div className="mt-2 rounded-sm bg-destructive/8 px-2 py-1.5 text-[11px] leading-4 text-destructive">
              Completed materials remain available. Retry to repair missing outcomes.
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function MessageActions({
  align,
  message,
  allowEdit,
  onEdit,
}: {
  readonly align: 'start' | 'end'
  readonly message: string
  readonly allowEdit: boolean
  readonly onEdit?: (message: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn(
        'mt-1 flex items-center gap-0.5 text-muted-foreground transition-opacity sm:opacity-0 sm:group-hover/message:opacity-100 sm:focus-within:opacity-100',
        align === 'end' ? 'justify-end' : 'justify-start',
      )}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Copy message" onClick={() => void copy()}>
              {copied ? <CheckCheck /> : <Copy />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copied ? 'Copied' : 'Copy'}</TooltipContent>
        </Tooltip>
        {allowEdit && onEdit ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Edit message" onClick={() => onEdit(message)}>
                <Pencil />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </TooltipProvider>
  )
}

function CostSummary({ cost, onOpenBudget, label }: {
  readonly cost: NonNullable<AgentWorkspaceViewModel['cost']>
  readonly onOpenBudget?: () => void
  readonly label: string
}) {
  const estimated = aggregateMoney(cost.estimated)
  const charged = aggregateMoney(cost.charged)
  return (
    <div data-slot="agent-cost-summary" className="flex min-w-0 items-center justify-between gap-2 border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
      <div className="flex min-w-0 items-center gap-1.5">
        <ReceiptText className="size-3.5 shrink-0" />
        <span className="truncate">{charged.length ? `Charged ${charged.join(' + ')}` : `Estimated ${estimated.join(' + ')}`}</span>
      </div>
      {onOpenBudget ? <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2" onClick={onOpenBudget}><BadgeDollarSign /> {label}</Button> : null}
    </div>
  )
}

function aggregateMoney(values: readonly { readonly currency: string; readonly amount: number; readonly credits?: number }[]): string[] {
  const totals = new Map<string, { amount: number; credits: number }>()
  for (const value of values) {
    const current = totals.get(value.currency) ?? { amount: 0, credits: 0 }
    totals.set(value.currency, { amount: current.amount + value.amount, credits: current.credits + (value.credits ?? 0) })
  }
  return [...totals].map(([currency, total]) => `${currency} ${total.amount.toFixed(2)}${total.credits ? ` · ${total.credits} credits` : ''}`)
}

function formatMoney(value: { readonly currency: string; readonly amount: number; readonly credits?: number }): string {
  return `${value.currency} ${value.amount.toFixed(2)}${value.credits !== undefined ? ` · ${value.credits} credits` : ''}`
}

export function OutcomeChecklist({
  items,
  heading,
  onOpenArtifact,
  compact = false,
}: {
  readonly items: readonly OutcomeChecklistItem[]
  readonly heading: string
  readonly onOpenArtifact?: (id: string) => void
  readonly compact?: boolean
}) {
  if (items.length === 0) return null
  const ordered = [...items].sort((a, b) => Number(a.status === 'complete') - Number(b.status === 'complete'))
  return (
    <section aria-labelledby="agent-outcomes-heading" className={cn('border-t border-border', compact ? 'p-3' : 'px-3 py-3')}>
      <SectionHeading id="agent-outcomes-heading">{heading}</SectionHeading>
      <ul className="mt-2 space-y-0.5">
        {ordered.map((item) => (
          <li key={item.id}>
            {onOpenArtifact && item.completedCount > 0 ? (
              <button
                type="button"
                aria-label={`Open ${item.label}`}
                onClick={() => onOpenArtifact(item.id)}
                className="flex w-full items-start gap-2 rounded px-1 py-1.5 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <OutcomeChecklistContent item={item} />
              </button>
            ) : (
              <div className="flex w-full items-start gap-2 px-1 py-1.5 text-left">
                <OutcomeChecklistContent item={item} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function OutcomeChecklistContent({ item }: { readonly item: OutcomeChecklistItem }) {
  return (
    <>
      <span className={cn(
        'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
        item.status === 'complete'
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border text-muted-foreground',
      )}>
        {item.status === 'complete' ? <Check className="size-2.5" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-xs font-medium', item.status === 'complete' && 'text-muted-foreground')}>
          {item.label}
        </span>
        <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{item.detail}</span>
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {item.completedCount}/{item.requiredCount}
      </span>
    </>
  )
}

export function AgentRunControls({
  summary,
  heading,
  labels,
  onPause,
  onResume,
  onCancel,
  onRetry,
  compact = false,
}: {
  readonly summary: AgentRunSummary
  readonly heading: string
  readonly labels: AgentDockLabels
  readonly onPause?: () => void
  readonly onResume?: () => void
  readonly onCancel?: () => void
  readonly onRetry?: () => void
  readonly compact?: boolean
}) {
  const running = summary.status === 'running'
  const repairable = summary.status === 'needs-repair' || summary.status === 'stopped' || summary.status === 'cancelled'
  const hasAction = (running && Boolean(onPause || onCancel))
    || (!running && summary.status !== 'ready' && Boolean(onResume))
    || (repairable && Boolean(onRetry))
  if (!hasAction) return null

  return (
    <section aria-label={heading} className={cn('flex flex-wrap gap-2', compact ? 'p-3' : 'px-4 py-3')}>
      {running && onPause ? (
        <Button type="button" variant="outline" size="sm" onClick={onPause}>
          <Pause /> {labels.pause}
        </Button>
      ) : null}
      {!running && onResume ? (
        <Button type="button" variant="outline" size="sm" onClick={onResume}>
          <Play /> {labels.resume}
        </Button>
      ) : null}
      {repairable && onRetry ? (
        <Button type="button" size="sm" onClick={onRetry}>
          <RefreshCw /> {labels.retry}
        </Button>
      ) : null}
      {running && onCancel ? (
        <Button type="button" variant="destructive" size="sm" onClick={onCancel}>
          <CircleStop /> {labels.cancel}
        </Button>
      ) : null}
    </section>
  )
}

export function AgentComposer({
  model,
  labels,
  compact = false,
}: {
  readonly model: AgentComposerModel
  readonly labels: AgentDockLabels
  readonly compact?: boolean
}) {
  const canSubmit = (model.value.trim().length > 0 || Boolean(model.allowEmptySubmit)) && !model.disabled && (Boolean(model.allowEmptySubmit) || !model.submitDisabled)
  const attachmentCount = model.attachments?.length ?? 0
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      if (canSubmit) model.onSubmit()
    }
  }

  return (
    <div data-slot="agent-composer" className={cn('bg-background', compact ? 'p-2.5' : 'p-2.5')}>
      {model.attachments?.length ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {model.attachments.map((attachment) => (
            <span key={attachment.id} className="flex max-w-full items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px]">
              {attachment.previewUrl && attachment.mediaType?.startsWith('image/') ? <img src={attachment.previewUrl} alt="" className="size-5 shrink-0 rounded-sm object-cover" /> : <FileCheck2 className="size-3 shrink-0" />}
              <span className="truncate">{attachment.label}</span>
              {attachment.status ? <span className="shrink-0 text-[10px] text-muted-foreground">{attachment.status}</span> : null}
              {model.onRemoveAttachment ? (
                <button
                  type="button"
                  aria-label={`Remove ${attachment.label}`}
                  disabled={model.disabled}
                  onClick={() => model.onRemoveAttachment?.(attachment.id)}
                  className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
      {model.materialContext ? (
        <div data-slot="agent-material-context" className="mb-1 rounded-md border border-border bg-muted/30 px-2 py-1.5">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">Editing {model.materialContext.label}</p>
              <p className={cn(
                'mt-0.5 text-[11px] leading-4',
                model.materialContext.blockedReason ? 'text-destructive' : 'text-muted-foreground',
              )}>
                {model.materialContext.blockedReason ?? model.materialContext.detail}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Clear material context"
              disabled={model.disabled}
              onClick={model.materialContext.onClear}
            >
              <X />
            </Button>
          </div>
        </div>
      ) : null}
      {/* Single shell: text + tools share one border — no nested textarea surface. */}
      <div
        data-slot="agent-composer-surface"
        className="rounded-xl border border-border bg-background shadow-[0_8px_24px_rgb(0_0_0/0.08)] transition-shadow focus-within:border-foreground/20 focus-within:shadow-[0_10px_28px_rgb(0_0_0/0.12)]"
      >
        <Textarea
          aria-label="Message the Agent"
          value={model.value}
          placeholder={model.placeholder ?? 'Describe a result, correction, or next step…'}
          disabled={model.disabled}
          onChange={(event) => model.onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          className="min-h-12 resize-none rounded-none border-0 bg-transparent px-3 pt-2.5 pb-1.5 text-sm leading-5 shadow-none outline-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
        />
        <TooltipProvider>
        <div data-slot="agent-composer-context" className="flex min-w-0 flex-wrap items-center justify-between gap-1 px-2 pb-2 pt-0.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5">
            {model.onAttach ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={labels.attach}
                    disabled={model.disabled}
                    onClick={model.onAttach}
                    className="relative"
                  >
                    <Paperclip />
                    {attachmentCount > 0 ? (
                      <span className="absolute -right-0.5 -top-0.5 flex min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] leading-3.5 text-primary-foreground">
                        {attachmentCount > 99 ? '99+' : attachmentCount}
                      </span>
                    ) : null}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">{labels.attach}</TooltipContent>
              </Tooltip>
            ) : null}
            <ConnectorMenu disabled={model.disabled} />
            {model.webSearch ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant={model.webSearch.enabled ? 'secondary' : 'ghost'}
                    size="sm"
                    aria-label={labels.webSearch}
                    aria-pressed={model.webSearch.enabled}
                    disabled={model.disabled || model.webSearch.disabled}
                    onClick={() => model.webSearch?.onChange(!model.webSearch.enabled)}
                    className="px-2"
                  >
                    <Globe2 />
                    <span className="hidden sm:inline">Web</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">{labels.webSearch}</TooltipContent>
              </Tooltip>
            ) : null}
            {model.modelSelection && model.modelSelection.value !== 'auto' ? (
              <ComposerSelectionMenu
                icon={<Bot />}
                label={labels.model}
                selection={model.modelSelection}
                disabled={model.disabled}
              />
            ) : null}
            {model.thinkingSelection && model.thinkingSelection.value !== 'auto' ? (
              <ComposerSelectionMenu
                icon={<BrainCircuit />}
                label={labels.thinking}
                selection={model.thinkingSelection}
                disabled={model.disabled}
              />
            ) : null}
          </div>
          {model.busy && model.onStop ? (
            <Button type="button" variant="outline" size="sm" onClick={model.onStop}>
              <CircleStop /> {labels.stop}
            </Button>
          ) : model.busy ? (
            <span
              role="status"
              aria-live="polite"
              className="flex h-7 shrink-0 items-center gap-1 px-1 text-[11px] text-muted-foreground"
            >
              <LoaderCircle className="size-3 animate-spin" />
              {labels.running}
            </span>
          ) : (
            <Button type="button" size="icon-sm" title={labels.send} aria-label={labels.send} disabled={!canSubmit} onClick={model.onSubmit}>
              <Send />
            </Button>
          )}
        </div>
        </TooltipProvider>
      </div>
    </div>
  )
}

function ComposerSelectionMenu({
  icon,
  label,
  selection,
  disabled = false,
}: {
  readonly icon: ReactNode
  readonly label: string
  readonly selection: AgentComposerSelection
  readonly disabled?: boolean
}) {
  const selected = selection.options.find((option) => option.value === selection.value)
  const selectedLabel = selected?.label ?? selection.value

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || selection.disabled}
          aria-label={`${label}: ${selectedLabel}`}
          className="min-w-0 max-w-36 px-2"
        >
          {icon}
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={selection.value} onValueChange={selection.onChange}>
          {selection.options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} className="items-start py-2">
              <span className="min-w-0">
                <span className="block truncate font-medium">{option.label}</span>
                {option.description ? (
                  <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                    {option.description}
                  </span>
                ) : null}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SectionHeading({ id, children }: { readonly id: string; readonly children: ReactNode }) {
  return <h3 id={id} className="text-[10px] font-medium text-muted-foreground">{children}</h3>
}

function StatusMark({ status }: { readonly status: AgentRunSummary['status'] }) {
  const className = 'mt-0.5 size-4 shrink-0'
  switch (status) {
    case 'running': return <LoaderCircle className={cn(className, 'animate-spin text-primary')} />
    case 'ready': return <Check className={cn(className, 'text-primary')} />
    case 'stopped': return <AlertTriangle className={cn(className, 'text-destructive')} />
    case 'cancelled': return <CircleStop className={cn(className, 'text-muted-foreground')} />
    case 'needs-repair': return <Wrench className={cn(className, 'text-amber-600 dark:text-amber-400')} />
    case 'draft': return <Sparkles className={cn(className, 'text-muted-foreground')} />
  }
}

function FeedIcon({ item }: { readonly item: AgentFeedItem }) {
  const className = 'mt-0.5 size-3.5 shrink-0'
  if (item.type === 'error') return <AlertTriangle className={cn(className, 'text-destructive')} />
  if (item.status === 'running') return <LoaderCircle className={cn(className, 'animate-spin text-primary')} />
  return <Check className={cn(className, 'text-muted-foreground')} />
}
