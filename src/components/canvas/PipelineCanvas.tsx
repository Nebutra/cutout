import { IntentWorkspace } from '@/components/workspace/IntentWorkspace'

export function PipelineCanvas({
  onOpenDesignOs,
  projectId,
}: {
  readonly onOpenDesignOs: (tab?: 'overview' | 'delivery' | 'specimen') => void
  readonly projectId?: string | null
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
      <IntentWorkspace
        onOpenDesignOs={onOpenDesignOs}
        projectId={projectId}
      />
    </div>
  )
}
