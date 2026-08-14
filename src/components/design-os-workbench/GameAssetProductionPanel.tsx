import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Check,
  CircleAlert,
  Gamepad2,
  ImagePlus,
  LoaderCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { createLocalProviderService } from '@/services/ai/provider-service.local'
import type { ProviderConfig } from '@/services/ai/provider-types'
import {
  applyPreparedGameAssetProductionRehearsal,
  applyPreparedGameAssetSemanticAcceptance,
  authorGameAssetActionRun,
  createGameAssetRehearsalRepository,
  prepareGameAssetProductionRehearsal,
  prepareGameAssetSemanticAcceptance,
  type AcceptedGameAssetProductionRehearsal,
  type AppliedGameAssetProductionRehearsal,
  type GameAssetRehearsalSummary,
  type LoadedGameAssetRehearsal,
  type PreparedGameAssetProductionRehearsal,
  type PreparedGameAssetSemanticAcceptance,
  type GameAssetLaunchRequest,
} from '@/game-asset-profile'

const supportedModels = new Set(['qwen-image-3.0', 'qwen-image-3.0-pro'])

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function frameUrl(base64: string): string {
  return `data:image/png;base64,${base64}`
}

export function GameAssetProductionPanel({ launch }: { readonly launch?: GameAssetLaunchRequest }) {
  const providerService = useMemo(() => createLocalProviderService(), [])
  const repository = useMemo(() => createGameAssetRehearsalRepository(), [])
  const [providers, setProviders] = useState<readonly ProviderConfig[]>([])
  const [providerId, setProviderId] = useState('')
  const [history, setHistory] = useState<readonly GameAssetRehearsalSummary[]>([])
  const [loaded, setLoaded] = useState<LoadedGameAssetRehearsal | null>(null)
  const [assetName, setAssetName] = useState('')
  const [kind, setKind] = useState<'player' | 'npc' | 'creature' | 'prop' | 'fx'>(launch?.intent.kind ?? 'player')
  const [view, setView] = useState<'side' | 'topdown' | 'three-quarter'>(launch?.intent.view ?? 'side')
  const [action, setAction] = useState<'single' | 'idle' | 'walk' | 'run' | 'attack' | 'cast' | 'jump' | 'hurt' | 'death'>(launch?.intent.action ?? 'run')
  const [direction, setDirection] = useState<'none' | 'down' | 'left' | 'right' | 'up'>(launch?.intent.direction ?? 'right')
  const [frameCount, setFrameCount] = useState(launch?.intent.frameCount ?? 4)
  const [alphaWidth, setAlphaWidth] = useState(640)
  const [alphaHeight, setAlphaHeight] = useState(800)
  const [anchor, setAnchor] = useState<'center' | 'bottom' | 'feet'>('feet')
  const [prompt, setPrompt] = useState(launch?.intent.sourceText ?? '')
  const [referenceFile, setReferenceFile] = useState<File | null>(null)
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null)
  const [prepared, setPrepared] = useState<PreparedGameAssetProductionRehearsal | null>(null)
  const [applied, setApplied] = useState<AppliedGameAssetProductionRehearsal | null>(null)
  const [acceptance, setAcceptance] = useState<PreparedGameAssetSemanticAcceptance | null>(null)
  const [accepted, setAccepted] = useState<AcceptedGameAssetProductionRehearsal | null>(null)
  const [reviewedRoles, setReviewedRoles] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState<'loading' | 'preview' | 'generation' | 'acceptance' | null>('loading')
  const [error, setError] = useState<string | null>(null)
  const launchReferenceSeeded = useRef(false)

  const refreshHistory = async () => {
    try {
      setHistory(await repository.list())
    } catch (reason) {
      setError(message(reason))
    }
  }

  useEffect(() => {
    let active = true
    void Promise.all([providerService.list(), repository.list()])
      .then(([configured, records]) => {
        if (!active) return
        const imageProviders = configured.filter((provider) => (
          provider.enabled
          && provider.kind === 'dashscope'
          && supportedModels.has(provider.defaultModel)
        ))
        setProviders(imageProviders)
        setProviderId((current) => current || imageProviders[0]?.id || '')
        setHistory(records)
      })
      .catch((reason) => {
        if (active) setError(message(reason))
      })
      .finally(() => {
        if (active) setBusy(null)
      })
    return () => { active = false }
  }, [providerService, repository])

  useEffect(() => () => {
    if (referenceUrl) URL.revokeObjectURL(referenceUrl)
  }, [referenceUrl])

  const selectedProvider = providers.find((provider) => provider.id === providerId)
  const resetRun = useCallback(() => {
    setPrepared(null)
    setApplied(null)
    setAcceptance(null)
    setAccepted(null)
    setReviewedRoles(new Set())
    setLoaded(null)
    setError(null)
  }, [])

  const selectReference = useCallback((file: File | null) => {
    setReferenceUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return file ? URL.createObjectURL(file) : null
    })
    setReferenceFile(file)
    resetRun()
  }, [resetRun])

  useEffect(() => {
    if (launchReferenceSeeded.current || !launch?.reference) return
    launchReferenceSeeded.current = true
    selectReference(new File(
      [new Uint8Array(launch.reference.bytes)],
      launch.reference.name,
      { type: launch.reference.mediaType },
    ))
  }, [launch, selectReference])

  const prepare = async () => {
    if (!referenceFile || !selectedProvider || !supportedModels.has(selectedProvider.defaultModel)) return
    setBusy('preview')
    setError(null)
    try {
      const input = await authorGameAssetActionRun({
        assetName,
        kind,
        view,
        action,
        direction,
        frameCount,
        prompt,
        frameWidth: 1024,
        frameHeight: 1024,
        expectedAlphaWidth: alphaWidth,
        expectedAlphaHeight: alphaHeight,
        anchor,
        referenceFile,
        providerId: selectedProvider.id,
        model: selectedProvider.defaultModel as 'qwen-image-3.0' | 'qwen-image-3.0-pro',
      })
      setPrepared(await prepareGameAssetProductionRehearsal(input))
      setApplied(null)
      setAcceptance(null)
      setAccepted(null)
      setReviewedRoles(new Set())
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(null)
    }
  }

  const generate = async () => {
    if (!prepared) return
    setBusy('generation')
    setError(null)
    try {
      const result = await applyPreparedGameAssetProductionRehearsal(prepared)
      setApplied(result)
      if (result.status === 'deterministic-evidence-verified') {
        await repository.save(assetName, result.bundle)
        await refreshHistory()
      }
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(null)
    }
  }

  const prepareAcceptance = async () => {
    if (applied?.status !== 'deterministic-evidence-verified'
      || reviewedRoles.size !== applied.bundle.frames.length) return
    setBusy('acceptance')
    setError(null)
    try {
      setAcceptance(await prepareGameAssetSemanticAcceptance(
        applied,
        applied.bundle.frames.map(({ roleId }) => ({
          roleId,
          referenceContinuity: 'accepted',
          roleReadability: 'accepted',
          styleConsistency: 'accepted',
        })),
      ))
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(null)
    }
  }

  const confirmAcceptance = async () => {
    if (!acceptance) return
    setBusy('acceptance')
    setError(null)
    try {
      const result = await applyPreparedGameAssetSemanticAcceptance(acceptance)
      setAccepted(result)
      await repository.save(assetName, result.bundle)
      await refreshHistory()
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(null)
    }
  }

  const displayed = accepted?.bundle
    ?? (applied?.status === 'deterministic-evidence-verified' ? applied.bundle : null)
    ?? loaded?.bundle
  const evaluation = accepted?.verified.evaluation
    ?? (applied?.status === 'deterministic-evidence-verified' ? applied.verified.evaluation : null)
    ?? loaded?.verified.evaluation

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4" data-slot="game-asset-production">
      <div className="flex min-w-0 items-center gap-3 border-b border-border pb-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
          <Gamepad2 className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Game asset production</h3>
          <p className="truncate text-xs text-muted-foreground">
            {launch ? 'Intent recognized · review before generation' : 'Native generation · deterministic Cutout · signed review'}
          </p>
        </div>
        {(prepared || displayed) ? (
          <Button type="button" variant="ghost" size="icon" onClick={resetRun} title="New run">
            <RotateCcw className="size-4" />
          </Button>
        ) : null}
      </div>

      {error ? (
        <div role="alert" className="flex items-start gap-2 border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {!displayed ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.7fr)]">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Asset name">
              <Input value={assetName} onChange={(event) => { setAssetName(event.target.value); resetRun() }} placeholder="Courier" />
            </Field>
            <Field label="Provider">
              <Select value={providerId} onValueChange={(value) => { setProviderId(value); resetRun() }}>
                <SelectTrigger><SelectValue placeholder="No Qwen image Provider" /></SelectTrigger>
                <SelectContent>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>{provider.label} · {provider.defaultModel}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Asset type">
              <Select value={kind} onValueChange={(value) => { setKind(value as typeof kind); resetRun() }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{['player', 'npc', 'creature', 'prop', 'fx'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="View">
              <Select value={view} onValueChange={(value) => { setView(value as typeof view); resetRun() }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{['side', 'topdown', 'three-quarter'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Action">
              <Select value={action} onValueChange={(value) => { setAction(value as typeof action); resetRun() }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{['single', 'idle', 'walk', 'run', 'attack', 'cast', 'jump', 'hurt', 'death'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Direction">
              <Select value={direction} onValueChange={(value) => { setDirection(value as typeof direction); resetRun() }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{['none', 'down', 'left', 'right', 'up'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Frames">
              <Input type="number" min={1} max={16} value={frameCount} onChange={(event) => { setFrameCount(Number(event.target.value)); resetRun() }} />
            </Field>
            <Field label="Anchor">
              <Select value={anchor} onValueChange={(value) => { setAnchor(value as typeof anchor); resetRun() }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{['feet', 'bottom', 'center'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Subject width">
              <Input type="number" min={1} max={1024} value={alphaWidth} onChange={(event) => { setAlphaWidth(Number(event.target.value)); resetRun() }} />
            </Field>
            <Field label="Subject height">
              <Input type="number" min={1} max={1024} value={alphaHeight} onChange={(event) => { setAlphaHeight(Number(event.target.value)); resetRun() }} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Direction prompt">
                <Textarea value={prompt} onChange={(event) => { setPrompt(event.target.value); resetRun() }} rows={5} placeholder="Visual identity, materials, silhouette, palette, and motion beat" />
              </Field>
            </div>
          </div>

          <div className="flex min-h-64 flex-col border border-border bg-muted/20 p-3">
            <Label htmlFor="game-asset-reference" className="text-xs">Master reference</Label>
            <label htmlFor="game-asset-reference" className="mt-2 flex min-h-48 flex-1 cursor-pointer items-center justify-center overflow-hidden border border-dashed border-border bg-background">
              {referenceUrl ? <img src={referenceUrl} alt="Selected master reference" className="max-h-72 w-full object-contain" /> : <ImagePlus className="size-6 text-muted-foreground" />}
              <input id="game-asset-reference" className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => selectReference(event.target.files?.[0] ?? null)} />
            </label>
            <p className="mt-2 truncate text-xs text-muted-foreground">{referenceFile?.name ?? 'PNG, JPEG, or WebP'}</p>
          </div>
        </div>
      ) : null}

      {prepared && !displayed ? (
        <div className="flex flex-wrap items-center gap-2 border-y border-border py-3">
          <Badge variant="outline">{prepared.preview.roleIds.length} roles</Badge>
          <Badge variant="outline">{prepared.preview.outputSize}</Badge>
          <Badge variant="outline">{prepared.preview.model}</Badge>
          <Badge variant="outline">Cutout verified</Badge>
          <Button type="button" className="ml-auto" onClick={() => void generate()} disabled={Boolean(busy)}>
            {busy === 'generation' ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
            Generate
          </Button>
        </div>
      ) : !displayed ? (
        <div className="flex justify-end">
          <Button type="button" onClick={() => void prepare()} disabled={Boolean(busy) || !referenceFile || !assetName.trim() || !prompt.trim() || !selectedProvider}>
            {busy === 'preview' ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            Preview run
          </Button>
        </div>
      ) : null}

      {applied?.status === 'partial' ? (
        <div className="border border-destructive/40 p-3 text-xs">
          <p className="font-medium text-destructive">Partial run · {applied.outputs.length} retained</p>
          <p className="mt-1 text-muted-foreground">{applied.error}</p>
        </div>
      ) : null}

      {displayed ? (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
            <Badge variant={accepted || loaded?.verified.semanticAcceptanceClosure.status === 'complete' ? 'secondary' : 'outline'}>
              {accepted || loaded?.verified.semanticAcceptanceClosure.status === 'complete' ? 'Semantic evidence verified' : 'Semantic review pending'}
            </Badge>
            <Badge variant={evaluation?.status === 'passed' ? 'secondary' : 'destructive'}>{evaluation?.status ?? 'blocked'}</Badge>
            <span className="ml-auto text-xs text-muted-foreground">{displayed.runId}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {displayed.frames.map((frame) => {
              const reviewed = reviewedRoles.has(frame.roleId)
              return (
                <div key={frame.roleId} className="min-w-0 border border-border bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(-45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(45deg,transparent_75%,hsl(var(--muted))_75%),linear-gradient(-45deg,transparent_75%,hsl(var(--muted))_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px]">
                  <img src={frameUrl(frame.artifactBytesBase64)} alt={frame.roleId} className="aspect-square w-full object-contain" />
                  <div className="border-t border-border bg-background p-2">
                    <p className="truncate text-xs font-medium">{frame.roleId}</p>
                    {!accepted && !loaded ? (
                      <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs text-muted-foreground">
                        <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={reviewed} onChange={(event) => setReviewedRoles((current) => {
                          const next = new Set(current)
                          if (event.target.checked) next.add(frame.roleId)
                          else next.delete(frame.roleId)
                          return next
                        })} />
                        <span>Identity · action · style</span>
                      </label>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
          {evaluation?.findings.length ? (
            <div className="border border-destructive/30 bg-destructive/5 p-3">
              {evaluation.findings.map((finding) => <p key={`${finding.roleId}:${finding.code}`} className="text-xs text-destructive">{finding.roleId} · {finding.code}</p>)}
            </div>
          ) : null}
          {!accepted && !loaded ? (
            <div className="flex justify-end border-t border-border pt-3">
              {acceptance ? (
                <Button type="button" onClick={() => void confirmAcceptance()} disabled={Boolean(busy)}>
                  {busy === 'acceptance' ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                  Confirm acceptance
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={() => void prepareAcceptance()} disabled={Boolean(busy) || reviewedRoles.size !== displayed.frames.length}>
                  <Check className="size-4" />
                  Preview acceptance
                </Button>
              )}
            </div>
          ) : null}
        </>
      ) : null}

      {history.length ? (
        <div className="border-t border-border pt-3">
          <h4 className="mb-2 text-xs font-medium">Retained rehearsals</h4>
          <div className="divide-y divide-border border-y border-border">
            {history.map((record) => (
              <div key={record.id} className="flex min-w-0 items-center gap-2 py-2 text-xs">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void repository.load(record.id).then(setLoaded).catch((reason) => setError(message(reason)))}>
                  <span className="block truncate font-medium">{record.name}</span>
                  <span className="text-muted-foreground">{record.roleCount} roles · {record.evaluationStatus}</span>
                </button>
                <Badge variant="outline">{record.status === 'semantic-evidence-verified' ? 'Accepted' : 'Review'}</Badge>
                <Button type="button" variant="ghost" size="icon" title="Remove retained rehearsal" onClick={() => {
                  if (!window.confirm(`Remove retained rehearsal "${record.name}"?`)) return
                  void repository.remove(record.id).then(refreshHistory).catch((reason) => setError(message(reason)))
                }}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Field({ label, children }: { readonly label: string, readonly children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
