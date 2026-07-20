import { AlertCircle, AlertTriangle, Image, RotateCcw, ScanSearch } from 'lucide-react'
import { useMemo } from 'react'
import {
  isSliceConsumable,
  useProductionReviewQueue,
  useSlices,
} from '@/store/selectors'
import type { ProductionReviewProjection } from '@/asset-production'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { SourceCanvas } from '@/components/source/SourceCanvas'
import { SliceGrid } from './SliceGrid'
import {
  needsSliceReview,
  unprojectedProductionBlockers,
} from './slice-review-model'

export function SliceOutcomeTabs({ onRetry }: { readonly onRetry?: () => void }) {
  const slices = useSlices()
  const productionReviewQueue = useProductionReviewQueue()
  const review = useMemo(() => slices.filter(needsSliceReview), [slices])
  const blockers = useMemo(
    () => unprojectedProductionBlockers(productionReviewQueue, slices),
    [productionReviewQueue, slices],
  )
  const results = useMemo(
    () => slices.filter((slice) => slice.included && isSliceConsumable(slice)),
    [slices],
  )
  const reviewCount = review.length + blockers.length
  return <Tabs defaultValue={results.length === 0 && reviewCount > 0 ? 'review' : 'result'} className="flex h-full min-h-0 flex-col gap-0" aria-label="Visual extraction results">
    <div className="shrink-0 border-b border-border px-3"><TabsList variant="line" className="h-10">
      <TabsTrigger value="source"><Image/>Source</TabsTrigger>
      <TabsTrigger value="result"><ScanSearch/>Result <span className="text-muted-foreground">{results.length}</span></TabsTrigger>
      <TabsTrigger value="review"><AlertTriangle/>Needs review {reviewCount > 0 ? <span className="rounded-full bg-amber-500/15 px-1.5 text-[10px] text-amber-700 dark:text-amber-300">{reviewCount}</span> : null}</TabsTrigger>
    </TabsList></div>
    <TabsContent value="source" className="min-h-0 overflow-hidden p-3"><SourceCanvas/></TabsContent>
    <TabsContent value="result" className="min-h-0 overflow-y-auto"><SliceGrid items={results}/>{results.length === 0 ? <Empty title="No included results" detail="Review excluded items or ask the Agent to regenerate the outcome."/> : null}</TabsContent>
    <TabsContent value="review" className="min-h-0 overflow-y-auto">{reviewCount > 0 ? <><div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">Only uncertain or failed checks appear here. Select an available result to correct it in Inspector.</div>{blockers.length > 0 ? <ProductionBlockers items={blockers} onRetry={onRetry}/> : null}{review.length > 0 ? <SliceGrid items={review}/> : null}</> : <Empty title="Nothing needs review" detail="All reported checks passed. Results without a confidence score remain available without inventing a failure."/>}</TabsContent>
  </Tabs>
}

function ProductionBlockers({
  items,
  onRetry,
}: {
  readonly items: readonly ProductionReviewProjection[]
  readonly onRetry?: () => void
}) {
  return <section aria-label="Blocked production tasks" className="border-b border-border">
    <div className="divide-y divide-border">
      {items.map((item) => {
        const failed = item.status === 'failed'
        const detail = item.issues[0]?.message
          ?? (failed ? 'Production stopped before a usable artifact was created.' : 'The artifact requires review before it can be consumed.')
        return <div key={item.taskId} className="flex items-start gap-3 px-4 py-3">
          <AlertCircle className={failed ? 'mt-0.5 size-4 shrink-0 text-destructive' : 'mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400'}/>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className="truncate text-sm font-medium">{item.label ?? item.manifestItemId}</p>
              <span className="text-[11px] text-muted-foreground">{failed ? 'Failed' : 'Needs review'}</span>
            </div>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</p>
            <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/80">{item.pageId} / {item.regionId}</p>
          </div>
        </div>
      })}
    </div>
    {onRetry ? <div className="flex justify-end border-t border-border px-4 py-2">
      <Button type="button" variant="outline" size="sm" onClick={onRetry}><RotateCcw/>Retry blocked production</Button>
    </div> : null}
  </section>
}

function Empty({ title, detail }: { readonly title: string; readonly detail: string }) {
  return <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center"><p className="text-sm font-medium">{title}</p><p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{detail}</p></div>
}
