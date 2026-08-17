import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Braces,
  Bug,
  CheckCircle2,
  CircleAlert,
  Download,
  FileImage,
  Layers3,
  LoaderCircle,
  Map,
  PackageCheck,
  Route,
  ShieldCheck,
} from 'lucide-react'
import { sha256Bytes } from '@/asset-production/hash'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  acceptGameMapSemanticReview,
  applyPreparedGameMapManagedBundle,
  assertGameMapLiveArtifactBytes,
  authorGameMapLiveRuntime,
  compileGameMapProductionPlan,
  defaultGameMapExplicitGeometry,
  fingerprintGameMapProductionPlan,
  prepareGameMapManagedBundle,
  produceGameMapLiveVisuals,
  projectGameMapWorkbench,
  type AppliedGameMapManagedBundle,
  type GameMapLaunchRequest,
  type GameMapLiveRuntimeClosure,
  type GameMapPlanningReferenceInput,
  type GameMapProductionPlan,
  type GameMapSemanticAcceptance,
  type GameMapSemanticReviewDecision,
  type GameMapWorkbenchProjection,
  type GameMapWorkbenchStatus,
  type NativeGameMapPreview,
  type PreparedGameMapManagedBundle,
} from '@/game-asset-profile'
import { createLocalProviderService } from '@/services/ai/provider-service.local'
import type { ProviderConfig } from '@/services/ai/provider-types'
import { useServices } from '@/services/context'

const LIVE_MAP_CANVAS = { width: 512, height: 512 } as const
const QWEN_IMAGE_3_MODELS = new Set(['qwen-image-3.0', 'qwen-image-3.0-pro'])
const MAP_REVIEWER_ID = 'reviewer:game-map-workbench:local-human'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function StatusBadge({ status }: { readonly status: GameMapWorkbenchStatus }) {
  return <Badge variant={status === 'blocked' || status === 'stale' ? 'destructive' : status === 'ready' ? 'secondary' : 'outline'}>{status}</Badge>
}

export function GameMapWorkbenchProjectionView({
  projection,
  nativePreview,
}: {
  readonly projection: GameMapWorkbenchProjection
  readonly nativePreview?: NativeGameMapPreview
}) {
  const planningNodes = projection.nodes.filter(({ authority }) => authority === 'planning-reference')
  const runtimeNodes = projection.nodes.filter(({ authority }) => (
    authority === 'runtime-input' || authority === 'runtime-manifest'
  ))
  const derivedNodes = projection.nodes.filter(({ authority }) => (
    authority === 'derived-preview' || authority === 'delivery'
  ))
  return (
    <div className="space-y-5" data-slot="game-map-workbench-projection">
      <div className="flex flex-wrap items-center gap-2 border-y border-border py-3">
        <Badge variant="secondary">{projection.mode}</Badge>
        <Badge variant="outline">{projection.world.width}x{projection.world.height}</Badge>
        <Badge variant="outline">{projection.playable ? 'Playable' : 'Visual only'}</Badge>
        <span className="ml-auto truncate text-xs text-muted-foreground">{projection.mapId}</span>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <FileImage className="size-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">Planning references</h4>
          </div>
          <div className="divide-y divide-border border-y border-border">
            {planningNodes.length ? planningNodes.map((node) => {
              const reference = projection.planningReferences.find(({ role }) => role === node.role)
              return (
                <div key={node.id} className="flex min-w-0 items-center gap-2 py-2 text-xs">
                  <span className="min-w-0 flex-1 truncate">{node.role}</span>
                  <StatusBadge status={reference?.status ?? node.status} />
                </div>
              )
            }) : <p className="py-3 text-xs text-muted-foreground">No planning-only reference</p>}
          </div>
        </section>

        <section className="min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <Layers3 className="size-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">Runtime authority</h4>
          </div>
          <div className="divide-y divide-border border-y border-border">
            {runtimeNodes.map((node) => (
              <div key={node.id} className="flex min-w-0 items-center gap-2 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate">{node.role}</span>
                <StatusBadge status={node.status} />
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-x-6 gap-y-4 border-y border-border py-4 sm:grid-cols-2 xl:grid-cols-4">
        <section className="min-w-0 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium"><Box className="size-4" />Objects</div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{projection.objectLibrary.objects.length} definitions</span>
            <StatusBadge status={projection.objectLibrary.status} />
          </div>
        </section>
        <section className="min-w-0 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium"><Layers3 className="size-4" />Terrain & placements</div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{projection.terrain.tileCount} tiles · {projection.placements.count} objects</span>
            <StatusBadge status={projection.placements.status === 'stale' ? 'stale' : projection.terrain.status} />
          </div>
        </section>
        <section className="min-w-0 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium"><Route className="size-4" />Runtime geometry</div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{projection.geometry.collisionCount} collision · {projection.geometry.exitCount} exits</span>
            <StatusBadge status={projection.geometry.status} />
          </div>
        </section>
        <section className="min-w-0 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium"><Bug className="size-4" />Preview & debug</div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{projection.preview.reachability?.status ?? 'pending'}</span>
            <StatusBadge status={projection.preview.status} />
          </div>
        </section>
      </div>

      {nativePreview ? (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <h4 className="text-sm font-medium">Composed preview</h4>
            <img
              src={`data:image/png;base64,${nativePreview.previewBytesBase64}`}
              alt="Composed runtime map"
              className="w-full border border-border bg-muted/20 object-contain"
            />
          </div>
          <div className="min-w-0 space-y-2">
            <h4 className="text-sm font-medium">Geometry debug overlay</h4>
            <img
              src={`data:image/png;base64,${nativePreview.debugOverlayBytesBase64}`}
              alt="Runtime map geometry debug overlay"
              className="w-full border border-border bg-muted/20 object-contain"
            />
          </div>
        </section>
      ) : null}

      {projection.objectLibrary.objects.length ? (
        <section className="space-y-2">
          <h4 className="text-sm font-medium">Object library</h4>
          <div className="divide-y divide-border border-y border-border">
            {projection.objectLibrary.objects.map((object) => (
              <div key={object.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-2 text-xs">
                <span className="truncate">{object.name}</span>
                <span className="text-muted-foreground">{object.placementCount} placed</span>
                <StatusBadge status={object.status} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {projection.runtimeLayers.length ? (
        <section className="space-y-2">
          <h4 className="text-sm font-medium">Runtime layers</h4>
          <div className="divide-y divide-border border-y border-border">
            {projection.runtimeLayers.map((layer) => (
              <div key={layer.id} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2 text-xs">
                <span className="tabular-nums text-muted-foreground">{layer.order}</span>
                <span className="truncate">{layer.kind} · {layer.id}</span>
                <StatusBadge status={layer.status} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {projection.blockers.length ? (
        <section className="border border-destructive/30 bg-destructive/5 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-destructive">
            <CircleAlert className="size-4" /> {projection.blockers.length} blocker{projection.blockers.length === 1 ? '' : 's'}
          </div>
          <div className="space-y-1">
            {projection.blockers.map((blocker) => (
              <p key={`${blocker.source}:${blocker.path}`} className="text-xs text-destructive">
                {blocker.path} · {blocker.message}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      <section className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <PackageCheck className="size-4 text-muted-foreground" />
        <span className="text-xs font-medium">Neutral map bundle</span>
        <Badge variant={projection.delivery.status === 'accepted' || projection.delivery.status === 'accepted-exported' ? 'secondary' : 'outline'}>
          {projection.delivery.status}
        </Badge>
        <div className="ml-auto flex flex-wrap gap-2">
          {derivedNodes.map((node) => (
            <span key={node.id} className="flex items-center gap-1 text-xs text-muted-foreground">
              {node.role}<StatusBadge status={node.status} />
            </span>
          ))}
        </div>
      </section>
    </div>
  )
}

interface MapSemanticReviewItem {
  readonly key: string
  readonly criterion: GameMapSemanticReviewDecision['criterion']
  readonly subjectId: string
  readonly label: string
  readonly notes: string
}

function semanticReviewItems(closure: GameMapLiveRuntimeClosure): readonly MapSemanticReviewItem[] {
  const runtimeId = closure.runtimeVisual.acceptedArtifact.artifact.id
  const objectId = closure.objectVisual.acceptedArtifact.artifact.id
  const items: MapSemanticReviewItem[] = [
    {
      key: `visual-role-fidelity:${runtimeId}`,
      criterion: 'visual-role-fidelity',
      subjectId: runtimeId,
      label: 'Runtime visual matches the inferred map role',
      notes: 'The displayed runtime visual is accepted for the inferred map role and art direction.',
    },
    {
      key: `object-cutout-quality:${objectId}`,
      criterion: 'object-cutout-quality',
      subjectId: objectId,
      label: 'Reusable object cutout is complete and clean',
      notes: 'The displayed reusable object has a complete silhouette and production-usable transparent edge.',
    },
    {
      key: `runtime-composition:${closure.preview.receipt.preview.id}`,
      criterion: 'runtime-composition',
      subjectId: closure.preview.receipt.preview.id,
      label: 'Runtime composition is visually coherent',
      notes: 'The deterministic preview composed from accepted runtime bytes is visually coherent.',
    },
    {
      key: `authored-geometry:${closure.preview.receipt.debugOverlay.id}`,
      criterion: 'authored-geometry',
      subjectId: closure.preview.receipt.debugOverlay.id,
      label: 'Authored geometry matches the intended play space',
      notes: 'The displayed debug overlay accurately represents the reviewed collision, zone, spawn, exit, and camera data.',
    },
  ]
  if (closure.plan.mode === 'tile') {
    items.push({
      key: `terrain-grid-coherence:${runtimeId}`,
      criterion: 'terrain-grid-coherence',
      subjectId: runtimeId,
      label: 'Terrain remains coherent on the exact tile grid',
      notes: 'The displayed terrain remains coherent when replayed through the exact authored 32-pixel grid.',
    })
  }
  return items
}

export function GameMapProductionPanel({ launch }: { readonly launch?: GameMapLaunchRequest }) {
  const services = useServices()
  const providerService = useMemo(() => createLocalProviderService(), [])
  const [mapName, setMapName] = useState('')
  const [brief, setBrief] = useState(launch?.intent.sourceText ?? '')
  const [referenceFile, setReferenceFile] = useState<File | null>(null)
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null)
  const [providers, setProviders] = useState<readonly ProviderConfig[]>([])
  const [providersLoaded, setProvidersLoaded] = useState(false)
  const [plan, setPlan] = useState<GameMapProductionPlan | null>(null)
  const [planningReferences, setPlanningReferences] = useState<readonly GameMapPlanningReferenceInput[]>([])
  const [closure, setClosure] = useState<GameMapLiveRuntimeClosure | null>(null)
  const [bundle, setBundle] = useState<PreparedGameMapManagedBundle | null>(null)
  const [acceptance, setAcceptance] = useState<GameMapSemanticAcceptance | null>(null)
  const [exportResult, setExportResult] = useState<AppliedGameMapManagedBundle | null>(null)
  const [reviewed, setReviewed] = useState<Readonly<Record<string, boolean>>>({})
  const [projection, setProjection] = useState<GameMapWorkbenchProjection | null>(null)
  const [busy, setBusy] = useState<'plan' | 'generation' | 'acceptance' | 'export' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const selectedProvider = providers[0]
  const reviewItems = closure ? semanticReviewItems(closure) : []
  const reviewComplete = reviewItems.length > 0 && reviewItems.every(({ key }) => reviewed[key])

  useEffect(() => {
    let active = true
    void providerService.list()
      .then((configured) => {
        if (!active) return
        setProviders(configured.filter((provider) => (
          provider.enabled
          && provider.kind === 'dashscope'
          && QWEN_IMAGE_3_MODELS.has(provider.defaultModel)
        )))
      })
      .catch((reason) => {
        if (active) setError(errorMessage(reason))
      })
      .finally(() => {
        if (active) setProvidersLoaded(true)
      })
    return () => { active = false }
  }, [providerService])

  useEffect(() => {
    if (!referenceFile) {
      setReferenceUrl(null)
      return
    }
    const url = URL.createObjectURL(referenceFile)
    setReferenceUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [referenceFile])

  useEffect(() => {
    if (!launch?.reference) return
    setReferenceFile(new File(
      [new Uint8Array(launch.reference.bytes)],
      launch.reference.name,
      { type: launch.reference.mediaType },
    ))
  }, [launch?.reference])

  const resetProjection = () => {
    setPlan(null)
    setPlanningReferences([])
    setClosure(null)
    setBundle(null)
    setAcceptance(null)
    setExportResult(null)
    setReviewed({})
    setProjection(null)
    setError(null)
  }

  const compile = async () => {
    setBusy('plan')
    setError(null)
    try {
      const nextPlan = await compileGameMapProductionPlan({
        sourceText: brief,
        mapName,
        canvas: LIVE_MAP_CANVAS,
      })
      const nextPlanningReferences = referenceFile && nextPlan.nodes.some(({ role }) => role === 'dressed-reference')
        ? [{
          role: 'dressed-reference' as const,
          reference: await referenceFile.arrayBuffer().then(async (buffer) => {
            const contentHash = await sha256Bytes(new Uint8Array(buffer))
            return {
              id: `artifact:sha256:${contentHash}`,
              revision: `revision:sha256:${contentHash}`,
              contentHash,
            }
          }),
        }]
        : []
      setPlan(nextPlan)
      setPlanningReferences(nextPlanningReferences)
      setProjection(await projectGameMapWorkbench({ plan: nextPlan, planningReferences: nextPlanningReferences }))
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(null)
    }
  }

  const generate = async () => {
    if (!plan) return
    if (!selectedProvider || !QWEN_IMAGE_3_MODELS.has(selectedProvider.defaultModel)) {
      setError('Enable a DashScope Qwen Image 3 Provider in Settings before generating this map.')
      return
    }
    setBusy('generation')
    setError(null)
    try {
      const production = await produceGameMapLiveVisuals({
        sourceText: brief,
        mapName: mapName.trim() || plan.title,
        providerId: selectedProvider.id,
        model: selectedProvider.defaultModel as 'qwen-image-3.0' | 'qwen-image-3.0-pro',
        runId: `run:game-map:${crypto.randomUUID()}`,
        canvas: LIVE_MAP_CANVAS,
      })
      const plannedHash = await fingerprintGameMapProductionPlan(plan)
      if (production.plan.id !== plan.id || production.planHash !== plannedHash) {
        throw new Error('The live Game Map plan drifted from the reviewed natural-language plan.')
      }
      await Promise.all([
        assertGameMapLiveArtifactBytes(production.runtimeVisual),
        assertGameMapLiveArtifactBytes(production.objectVisual),
      ])
      const nextClosure = await authorGameMapLiveRuntime(
        production,
        defaultGameMapExplicitGeometry(production.plan),
      )
      const nextBundle = await prepareGameMapManagedBundle({
        runtime: nextClosure.runtime,
        preview: nextClosure.preview,
      })
      const nextProjection = await projectGameMapWorkbench({
        plan: production.plan,
        planningReferences,
        runtime: nextClosure.runtime,
        preview: nextClosure.preview,
        bundle: nextBundle,
      })
      setClosure(nextClosure)
      setBundle(nextBundle)
      setAcceptance(null)
      setExportResult(null)
      setReviewed({})
      setProjection(nextProjection)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(null)
    }
  }

  const acceptReview = async () => {
    if (!closure || !reviewComplete) return
    setBusy('acceptance')
    setError(null)
    try {
      const decisions = reviewItems.map(({ criterion, subjectId, notes }) => ({
        subjectId,
        criterion,
        status: 'accepted' as const,
        reviewerKind: 'local-human-visual-review' as const,
        reviewerId: MAP_REVIEWER_ID,
        evidenceArtifactIds: [subjectId] as [string],
        notes,
      }))
      const accepted = await acceptGameMapSemanticReview(closure, decisions)
      const acceptedBundle = await prepareGameMapManagedBundle({
        runtime: closure.runtime,
        preview: closure.preview,
        semanticAcceptance: {
          receipt: accepted.acceptance,
          artifacts: [...closure.artifacts],
        },
      })
      const nextProjection = await projectGameMapWorkbench({
        plan: closure.plan,
        planningReferences,
        runtime: closure.runtime,
        preview: closure.preview,
        bundle: acceptedBundle,
      })
      setAcceptance(accepted.acceptance)
      setBundle(acceptedBundle)
      setProjection(nextProjection)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(null)
    }
  }

  const exportBundle = async () => {
    if (!closure || !bundle || bundle.bundle.deliveryStatus !== 'accepted') return
    setBusy('export')
    setError(null)
    try {
      const applied = await applyPreparedGameMapManagedBundle(bundle, services.bundles)
      setExportResult(applied)
      setProjection(await projectGameMapWorkbench({
        plan: closure.plan,
        planningReferences,
        runtime: closure.runtime,
        preview: closure.preview,
        bundle,
        exportResult: applied,
      }))
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4" data-slot="game-map-production">
      <div className="flex min-w-0 items-center gap-3 border-b border-border pb-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
          <Map className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Game map production</h3>
          <p className="truncate text-xs text-muted-foreground">{plan ? `${plan.mode} · ${plan.title}` : 'Natural-language runtime map'}</p>
        </div>
        <Badge variant={selectedProvider ? 'secondary' : 'outline'}>
          {selectedProvider
            ? `${selectedProvider.label} · ${selectedProvider.defaultModel}`
            : providersLoaded ? 'Qwen Image 3 unavailable' : 'Loading Qwen route'}
        </Badge>
      </div>

      {error ? (
        <div role="alert" className="flex items-start gap-2 border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {!plan ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.65fr)]">
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label htmlFor="game-map-name" className="text-xs">Map name</Label>
              <Input id="game-map-name" value={mapName} onChange={(event) => { setMapName(event.target.value); resetProjection() }} placeholder="Forest pass" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="game-map-brief" className="text-xs">Map brief</Label>
              <Textarea id="game-map-brief" value={brief} onChange={(event) => { setBrief(event.target.value); resetProjection() }} rows={8} placeholder="Create a playable scene map with collision, spawn, exit, reusable props, and a bounded camera." />
            </div>
          </div>
          <div className="flex min-h-64 flex-col border border-border bg-muted/20 p-3">
            <Label htmlFor="game-map-reference" className="text-xs">Planning reference</Label>
            <label htmlFor="game-map-reference" className="mt-2 flex min-h-48 flex-1 cursor-pointer items-center justify-center overflow-hidden border border-dashed border-border bg-background">
              {referenceUrl
                ? <img src={referenceUrl} alt="Selected map planning reference" className="max-h-72 w-full object-contain" />
                : <FileImage className="size-6 text-muted-foreground" />}
              <input id="game-map-reference" className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { setReferenceFile(event.target.files?.[0] ?? null); resetProjection() }} />
            </label>
            <p className="mt-2 truncate text-xs text-muted-foreground">{referenceFile?.name ?? 'Optional planning-only image'}</p>
          </div>
        </div>
      ) : null}

      {closure ? (
        <section className="grid gap-4 border-y border-border py-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <h4 className="text-sm font-medium">Runtime visual</h4>
            <div className="aspect-square overflow-hidden border border-border bg-muted/20">
              <img
                src={`data:image/png;base64,${closure.runtimeVisual.bytesBase64}`}
                alt="Accepted runtime map visual"
                className="size-full object-contain"
              />
            </div>
          </div>
          <div className="min-w-0 space-y-2">
            <h4 className="text-sm font-medium">Reusable object cutout</h4>
            <div className="aspect-square overflow-hidden border border-border bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%,transparent_75%,hsl(var(--muted))_75%),linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%,transparent_75%,hsl(var(--muted))_75%)] bg-[length:20px_20px] bg-[position:0_0,10px_10px]">
              <img
                src={`data:image/png;base64,${closure.objectVisual.bytesBase64}`}
                alt="Accepted reusable map object cutout"
                className="size-full object-contain"
              />
            </div>
          </div>
        </section>
      ) : null}

      {projection ? <GameMapWorkbenchProjectionView projection={projection} nativePreview={closure?.preview} /> : null}

      {closure && !acceptance ? (
        <section className="space-y-3 border-y border-border py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">Production review</h4>
          </div>
          <div className="divide-y divide-border border-y border-border">
            {reviewItems.map((item) => (
              <label key={item.key} className="flex cursor-pointer items-center gap-3 py-3 text-xs">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-primary"
                  checked={Boolean(reviewed[item.key])}
                  onChange={(event) => setReviewed((current) => ({
                    ...current,
                    [item.key]: event.target.checked,
                  }))}
                />
                <span className="min-w-0 flex-1">{item.label}</span>
                <span className="max-w-40 truncate text-muted-foreground">{item.criterion}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={() => void acceptReview()} disabled={!reviewComplete || busy !== null}>
              {busy === 'acceptance' ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Accept reviewed map
            </Button>
          </div>
        </section>
      ) : null}

      <div className="flex justify-end border-t border-border pt-3">
        <div className="flex flex-wrap gap-2">
          {plan ? (
            <Button type="button" variant="outline" onClick={resetProjection} disabled={busy !== null}>
              <Braces className="size-4" /> Revise brief
            </Button>
          ) : null}
          {plan && !closure && (plan.mode === 'scene' || plan.mode === 'tile') ? (
            <Button type="button" onClick={() => void generate()} disabled={busy !== null || !selectedProvider}>
              {busy === 'generation' ? <LoaderCircle className="size-4 animate-spin" /> : <Map className="size-4" />}
              Generate runtime map
            </Button>
          ) : null}
          {acceptance && bundle?.bundle.deliveryStatus === 'accepted' ? (
            <Button type="button" onClick={() => void exportBundle()} disabled={busy !== null || exportResult?.status === 'accepted-exported'}>
              {busy === 'export' ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
              {exportResult?.status === 'accepted-exported' ? 'Exported' : 'Export accepted bundle'}
            </Button>
          ) : null}
          {!plan ? (
            <Button type="button" onClick={() => void compile()} disabled={busy !== null || !brief.trim()}>
              {busy === 'plan' ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              Build runtime plan
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
