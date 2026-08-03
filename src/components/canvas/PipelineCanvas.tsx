import { IntentWorkspace } from '@/components/workspace/IntentWorkspace'

export function PipelineCanvas({
  onOpenDesignOs,
}: {
  readonly onOpenDesignOs: (tab?: 'overview' | 'delivery' | 'specimen') => void
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
      <IntentWorkspace
        onOpenDesignOs={onOpenDesignOs}
      />
    </div>
  )
}
