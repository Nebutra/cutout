import {
  acceptCommerceProjectLifecycleRecord,
  requestCommerceProjectDownload,
  type CommerceProjectLifecycleRecord,
} from '@/commerce-profile/project-lifecycle'
import { downloadCommerceProjectFiles } from '@/commerce-profile/project-download'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Check, Download, RefreshCw } from 'lucide-react'
import { CommerceDeliverablePreview } from './CommerceDeliverablePreview'
import { commerceRoleLabel } from './commerce-view-labels'

export interface CommerceProjectLifecycleReviewProps {
  readonly record: CommerceProjectLifecycleRecord
  readonly currentRevisionId: string
  readonly onLifecycleChange: (record: CommerceProjectLifecycleRecord) => void
  readonly onRegenerate: () => void
}

export function CommerceProjectLifecycleReview({
  record,
  currentRevisionId,
  onLifecycleChange,
  onRegenerate,
}: CommerceProjectLifecycleReviewProps) {
  const current = record.designRevisionId === currentRevisionId
  const receiptCount = record.result.deliverables.reduce(
    (count, deliverable) => count
      + 1
      + (deliverable.qa ? 1 : 0)
      + (deliverable.playbackSourceReceipt ? 1 : 0),
    0,
  )
  const requestDownload = () => {
    if (!current || !record.review) return
    downloadCommerceProjectFiles(record.result)
    onLifecycleChange(requestCommerceProjectDownload(record))
  }

  return (
    <section aria-label="Commerce lifecycle review" className="min-w-0 space-y-4">
      <div className="flex min-w-0 flex-col gap-3 border-y border-border py-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Commerce material set</h3>
            <Badge variant={current && record.review ? 'secondary' : 'outline'}>
              {!current
                ? 'Stale revision'
                : record.review
                  ? record.delivery
                    ? 'Download requested'
                    : 'Accepted'
                  : 'Review required'}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {record.result.deliverables.length} retained artifacts · {receiptCount} Provider, QA, and playback receipts
          </p>
        </div>
        {!current ? (
          <Button type="button" size="sm" variant="outline" onClick={onRegenerate}>
            <RefreshCw /> Regenerate
          </Button>
        ) : !record.review ? (
          <Button
            type="button"
            size="sm"
            onClick={() => onLifecycleChange(acceptCommerceProjectLifecycleRecord(record))}
          >
            <Check /> Accept exact set
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={requestDownload}>
            <Download /> {record.delivery ? 'Download files again' : 'Download files'}
          </Button>
        )}
      </div>

      <CommerceLifecycleEvidence record={record} />

      {record.delivery ? (
        <p className="text-[11px] text-muted-foreground">
          Browser download requested {record.delivery.requestedAt}. This is not a verified filesystem receipt.
        </p>
      ) : null}
    </section>
  )
}

export function CommerceLifecycleEvidence({
  record,
}: {
  readonly record: CommerceProjectLifecycleRecord
}) {
  return (
    <div className="min-w-0 space-y-3">
      <div
        aria-label="Commerce retained artifact previews"
        className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4"
      >
        {record.result.deliverables.map((deliverable) => (
          <CommerceDeliverablePreview
            key={deliverable.semanticRole}
            deliverable={deliverable}
          />
        ))}
      </div>
      <div className="min-w-0 border-t border-border pt-3">
        <h4 className="text-xs font-semibold">Receipt and QA closure</h4>
        <ul
          aria-label="Commerce receipt and QA evidence"
          className="mt-2 divide-y divide-border text-[11px]"
        >
          {record.result.deliverables.map((deliverable) => (
            <li
              key={deliverable.providerReceipt.receiptId}
              className="grid min-w-0 gap-1 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:gap-3"
            >
              <span className="truncate font-medium" title={deliverable.fileName}>
                {commerceRoleLabel(deliverable.semanticRole)}
              </span>
              <span className="min-w-0 break-all font-mono text-muted-foreground">
                Provider {deliverable.providerReceipt.receiptId}
                {deliverable.qa ? ` · QA ${deliverable.qa.receipt.receiptId}` : ''}
                {deliverable.playbackSourceReceipt
                  ? ` · Playback ${deliverable.playbackSourceReceipt.receiptId}`
                  : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
