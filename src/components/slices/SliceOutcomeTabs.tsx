import { AlertTriangle, Image, ScanSearch } from 'lucide-react'
import { useMemo } from 'react'
import { useSlices } from '@/store/selectors'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SourceCanvas } from '@/components/source/SourceCanvas'
import { SliceGrid } from './SliceGrid'
import { needsSliceReview } from './slice-review-model'

export function SliceOutcomeTabs() {
  const slices = useSlices()
  const review = useMemo(() => slices.filter(needsSliceReview), [slices])
  const results = useMemo(() => slices.filter((slice) => slice.included), [slices])
  return <Tabs defaultValue="result" className="flex h-full min-h-0 flex-col gap-0" aria-label="Visual extraction results">
    <div className="shrink-0 border-b border-border px-3"><TabsList variant="line" className="h-10">
      <TabsTrigger value="source"><Image/>Source</TabsTrigger>
      <TabsTrigger value="result"><ScanSearch/>Result <span className="text-muted-foreground">{results.length}</span></TabsTrigger>
      <TabsTrigger value="review"><AlertTriangle/>Needs review {review.length > 0 ? <span className="rounded-full bg-amber-500/15 px-1.5 text-[10px] text-amber-700 dark:text-amber-300">{review.length}</span> : null}</TabsTrigger>
    </TabsList></div>
    <TabsContent value="source" className="min-h-0 overflow-hidden p-3"><SourceCanvas/></TabsContent>
    <TabsContent value="result" className="min-h-0 overflow-y-auto"><SliceGrid items={results}/>{results.length === 0 ? <Empty title="No included results" detail="Review excluded items or ask the Agent to regenerate the outcome."/> : null}</TabsContent>
    <TabsContent value="review" className="min-h-0 overflow-y-auto">{review.length > 0 ? <><div className="border-b border-border px-3 py-2 text-xs text-muted-foreground">Only uncertain or failed checks appear here. Select an item to correct it in Inspector.</div><SliceGrid items={review}/></> : <Empty title="Nothing needs review" detail="All reported checks passed. Results without a confidence score remain available without inventing a failure."/>}</TabsContent>
  </Tabs>
}

function Empty({ title, detail }: { readonly title: string; readonly detail: string }) {
  return <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center"><p className="text-sm font-medium">{title}</p><p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{detail}</p></div>
}
