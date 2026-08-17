import { lazy, Suspense, useState } from 'react'
import {
  createCommerceProjectLifecycleRecord,
  type CommerceProjectLifecycleRecord,
} from '@/commerce-profile/project-lifecycle'
import { CommerceProjectLifecycleReview } from '@/components/design-os-workbench/CommerceProjectLifecycleReview'
import { Button } from '@/components/ui/button'
import type { CanvasProfileLaunch } from '@/workspace/scenario-launch'
import { ArrowLeft, Boxes, Gamepad2 } from 'lucide-react'

const CommerceProductionPanel = lazy(() =>
  import('@/components/design-os-workbench/CommerceProductionPanel').then((module) => ({
    default: module.CommerceProductionPanel,
  })),
)

const GameAssetProductionPanel = lazy(() =>
  import('@/components/design-os-workbench/GameAssetProductionPanel').then((module) => ({
    default: module.GameAssetProductionPanel,
  })),
)

export interface CanvasProfileStageProps {
  readonly launch: CanvasProfileLaunch
  readonly currentRevisionId: string | null
  readonly commerceLifecycle: CommerceProjectLifecycleRecord | null
  readonly onCommerceLifecycleChange: (
    record: CommerceProjectLifecycleRecord | undefined,
  ) => void
  readonly onClose: () => void
}

export function CanvasProfileStage({
  launch,
  currentRevisionId,
  commerceLifecycle,
  onCommerceLifecycleChange,
  onClose,
}: CanvasProfileStageProps) {
  const [commerceView, setCommerceView] = useState<'create' | 'review'>('create')
  const commerce = launch.kind === 'commerce'
  const title = commerce ? 'Commerce materials' : 'Game assets'
  const description = commerce ? launch.sourceText : launch.launch.intent.sourceText

  return (
    <section
      data-canvas-profile-stage={launch.kind}
      aria-label={`${title} Canvas production`}
      className="flex h-full min-h-0 flex-col bg-background"
    >
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border px-3 sm:px-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label="Back to artifact board"
          title="Back to artifact board"
          onClick={onClose}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
          {commerce ? <Boxes className="size-4" /> : <Gamepad2 className="size-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <p className="truncate text-xs text-muted-foreground" title={description}>
            {description}
          </p>
        </div>
        {commerce && commerceLifecycle ? (
          <div className="flex shrink-0 rounded-md bg-muted p-0.5" aria-label="Commerce Canvas view">
            <button
              type="button"
              aria-pressed={commerceView === 'create'}
              className={commerceView === 'create'
                ? 'h-7 rounded bg-background px-2.5 text-xs font-medium shadow-sm'
                : 'h-7 rounded px-2.5 text-xs text-muted-foreground hover:text-foreground'}
              onClick={() => setCommerceView('create')}
            >
              Create
            </button>
            <button
              type="button"
              aria-pressed={commerceView === 'review'}
              className={commerceView === 'review'
                ? 'h-7 rounded bg-background px-2.5 text-xs font-medium shadow-sm'
                : 'h-7 rounded px-2.5 text-xs text-muted-foreground hover:text-foreground'}
              onClick={() => setCommerceView('review')}
            >
              Review
            </button>
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-5">
        <Suspense fallback={<CanvasProfileLoading label={`Loading ${title}`} />}>
          {launch.kind === 'game-assets' ? (
            <GameAssetProductionPanel launch={launch.launch} />
          ) : !currentRevisionId ? (
            <div role="status" className="mx-auto max-w-lg border-y border-border py-6 text-sm">
              A current Design IR revision is required before Commerce production can retain review and delivery evidence.
            </div>
          ) : commerceView === 'review' && commerceLifecycle ? (
            <CommerceProjectLifecycleReview
              record={commerceLifecycle}
              currentRevisionId={currentRevisionId}
              onLifecycleChange={onCommerceLifecycleChange}
              onRegenerate={() => setCommerceView('create')}
            />
          ) : (
            <CommerceProductionPanel
              modeScope="project"
              retainedResult={commerceLifecycle?.result}
              retainedResultStale={Boolean(
                commerceLifecycle
                && commerceLifecycle.designRevisionId !== currentRevisionId,
              )}
              onCompleted={(result) => {
                onCommerceLifecycleChange(createCommerceProjectLifecycleRecord({
                  designRevisionId: currentRevisionId,
                  result,
                }))
                setCommerceView('review')
              }}
              onReset={() => onCommerceLifecycleChange(undefined)}
              onRequestReview={() => setCommerceView('review')}
            />
          )}
        </Suspense>
      </div>
    </section>
  )
}

function CanvasProfileLoading({ label }: { readonly label: string }) {
  return (
    <div role="status" className="grid min-h-52 place-items-center text-xs text-muted-foreground">
      {label}
    </div>
  )
}
