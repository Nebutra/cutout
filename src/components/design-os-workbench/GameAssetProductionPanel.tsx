import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Check,
  CircleAlert,
  Download,
  Gamepad2,
  ImagePlus,
  LoaderCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { base64ToBytes } from '@/lib/image'
import { createLocalProviderService } from '@/services/ai/provider-service.local'
import type { ProviderConfig } from '@/services/ai/provider-types'
import { qwenImage3Route, servesQwenImage3 } from './qwen-image-3-route'
import { useServices } from '@/services/context'
import { GameMapProductionPanel } from './GameMapProductionPanel'
import {
  applyPreparedGameAssetProductionRehearsal,
  applyPreparedGameAssetProductionRepair,
  applyPreparedGameAssetSemanticAcceptance,
  authorGameAssetActionRun,
  authorGameAssetFamilyRun,
  compileGameAssetProductionBundle,
  compileGameAssetActionSheetRepairPrompt,
  createGameAssetActionSheetDesktopRunner,
  createGameAssetFamilyProductionDesktopRunner,
  createGameAssetRehearsalRepository,
  mergeGameAssetActionSheetPartialRepair,
  mergeGameAssetActionSheetPartialReprocess,
  mergeGameAssetActionSheetRepair,
  projectGameAssetFamilyActionStates,
  prepareGameAssetProductionRehearsal,
  prepareGameAssetProductionRepair,
  prepareGameAssetSemanticAcceptance,
  type AcceptedGameAssetProductionRehearsal,
  type AppliedGameAssetProductionRehearsal,
  type AuthoredGameAssetFamilyRun,
  type CompiledGameAssetBundle,
  type CompiledGameAssetFamilyBundle,
  type GameAssetActionSheetApplyResult,
  type GameAssetActionSheetRepairPreview,
  type GameAssetActionSheetPartialRepairPreview,
  type GameAssetActionSheetPartialReprocessPreview,
  type GameAssetActionSheetPreview,
  type GameAssetFamilyAcceptancePreview,
  type GameAssetFamilyProductionInput,
  type GameAssetRehearsalSummary,
  type LoadedGameAssetRehearsal,
  type PreparedGameAssetProductionRehearsal,
  type PreparedGameAssetProductionRepair,
  type PreparedGameAssetSemanticAcceptance,
  type GameAssetLaunchRequest,
  type GameMapLaunchRequest,
  type GameSpriteAssetLaunchRequest,
  type MergedGameAssetActionSheetRepair,
  type MergedGameAssetActionSheetPartialRepair,
  type MergedGameAssetActionSheetPartialReprocess,
  type NativeGameAssetFamilyAcceptance,
  gameAssetFamilyProductionInputSchema,
} from '@/game-asset-profile'


function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function frameUrl(base64: string): string {
  return `data:image/png;base64,${base64}`
}

interface PreparedGameAssetFamilyRun {
  readonly authored: AuthoredGameAssetFamilyRun
  readonly previews: readonly GameAssetActionSheetPreview[]
}

type PreparedGameAssetFamilyRepair = {
  readonly groupIndex: number
  readonly kind: 'complete'
  readonly preview: GameAssetActionSheetRepairPreview
} | {
  readonly groupIndex: number
  readonly kind: 'partial'
  readonly preview: GameAssetActionSheetPartialRepairPreview
} | {
  readonly groupIndex: number
  readonly kind: 'local'
  readonly preview: GameAssetActionSheetPartialReprocessPreview
}

type MergedGameAssetFamilyRepair =
  | MergedGameAssetActionSheetRepair
  | MergedGameAssetActionSheetPartialRepair
  | MergedGameAssetActionSheetPartialReprocess

function preparedFamilyRepairRoleIds(prepared: PreparedGameAssetFamilyRepair): readonly string[] {
  return prepared.kind === 'local'
    ? prepared.preview.reprocessedRoleIds
    : prepared.preview.replacementRoleIds
}

function FamilyBundlePlayback({ bundle }: { readonly bundle: CompiledGameAssetFamilyBundle }) {
  const [groupId, setGroupId] = useState(bundle.manifest.animations[0]!.groupId)
  const [ordinal, setOrdinal] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animation = bundle.manifest.animations.find((candidate) => candidate.groupId === groupId)
    ?? bundle.manifest.animations[0]!
  const roleId = animation.roleIds[ordinal % animation.roleIds.length]
  const frame = bundle.manifest.frames.find((candidate) => candidate.roleId === roleId)!
  const atlas = bundle.atlases.find((candidate) => candidate.logicalPath === frame.atlasLogicalPath)!

  useEffect(() => setOrdinal(0), [groupId])
  useEffect(() => {
    if (!animation.looping && ordinal >= animation.roleIds.length - 1) return
    const timer = window.setTimeout(() => {
      setOrdinal((current) => animation.looping
        ? (current + 1) % animation.roleIds.length
        : Math.min(current + 1, animation.roleIds.length - 1))
    }, frame.durationMs)
    return () => window.clearTimeout(timer)
  }, [animation.looping, animation.roleIds.length, frame.durationMs, ordinal])
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const image = new Image()
    image.onload = () => {
      canvas.width = frame.cell.width
      canvas.height = frame.cell.height
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(
        image,
        frame.cell.x,
        frame.cell.y,
        frame.cell.width,
        frame.cell.height,
        0,
        0,
        frame.cell.width,
        frame.cell.height,
      )
    }
    image.src = `data:${atlas.mediaType};base64,${atlas.bytesBase64}`
    return () => { image.onload = null }
  }, [atlas.bytesBase64, atlas.mediaType, frame])

  return (
    <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
      <div className="space-y-2">
        <Select value={animation.groupId} onValueChange={setGroupId}>
          <SelectTrigger aria-label="Animation"><SelectValue /></SelectTrigger>
          <SelectContent>
            {bundle.manifest.animations.map((candidate) => (
              <SelectItem key={candidate.groupId} value={candidate.groupId}>
                {candidate.action} · {candidate.direction}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{animation.looping ? 'Loop' : 'One shot'}</Badge>
          <Badge variant="outline">{frame.durationMs} ms</Badge>
          <span>{ordinal + 1}/{animation.roleIds.length}</span>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className="aspect-square w-full max-w-[360px] border border-border bg-[linear-gradient(45deg,var(--muted)_25%,transparent_25%),linear-gradient(-45deg,var(--muted)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,var(--muted)_75%),linear-gradient(-45deg,transparent_75%,var(--muted)_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px]"
        aria-label={`${animation.action} ${animation.direction} playback`}
      />
    </div>
  )
}

export function GameAssetProductionPanel({ launch }: { readonly launch?: GameAssetLaunchRequest }) {
  if (isGameMapLaunchRequest(launch)) return <GameMapProductionPanel launch={launch} />
  return <SpriteAssetProductionPanel launch={launch} />
}

function isGameMapLaunchRequest(
  launch: GameAssetLaunchRequest | undefined,
): launch is GameMapLaunchRequest {
  return launch?.intent.scope === 'map'
}

function SpriteAssetProductionPanel({ launch }: { readonly launch?: GameSpriteAssetLaunchRequest }) {
  const services = useServices()
  const providerService = useMemo(() => createLocalProviderService(), [])
  const repository = useMemo(() => createGameAssetRehearsalRepository(), [])
  const familyRunner = useMemo(() => createGameAssetActionSheetDesktopRunner(), [])
  const familyProductionRunner = useMemo(() => createGameAssetFamilyProductionDesktopRunner(), [])
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
  const [compiled, setCompiled] = useState<CompiledGameAssetBundle | null>(null)
  const [exportedDir, setExportedDir] = useState<string | null>(null)
  const [previewOrdinal, setPreviewOrdinal] = useState(0)
  const [repairPrepared, setRepairPrepared] = useState<PreparedGameAssetProductionRepair | null>(null)
  const [familyPrepared, setFamilyPrepared] = useState<PreparedGameAssetFamilyRun | null>(null)
  const [familyResults, setFamilyResults] = useState<readonly GameAssetActionSheetApplyResult[]>([])
  const [familyActiveIndex, setFamilyActiveIndex] = useState<number | null>(null)
  const [familyRepairPrepared, setFamilyRepairPrepared] = useState<PreparedGameAssetFamilyRepair | null>(null)
  const [familyRepairs, setFamilyRepairs] = useState<Readonly<Record<string, MergedGameAssetFamilyRepair>>>({})
  const [familyProductionInput, setFamilyProductionInput] = useState<GameAssetFamilyProductionInput | null>(null)
  const [familyAcceptancePreview, setFamilyAcceptancePreview] = useState<GameAssetFamilyAcceptancePreview | null>(null)
  const [familyAcceptance, setFamilyAcceptance] = useState<NativeGameAssetFamilyAcceptance | null>(null)
  const [familyCompiled, setFamilyCompiled] = useState<CompiledGameAssetFamilyBundle | null>(null)
  const [familyExportedDir, setFamilyExportedDir] = useState<string | null>(null)
  const [roleReviews, setRoleReviews] = useState<Readonly<Record<string, 'accepted' | 'repair'>>>({})
  const [busy, setBusy] = useState<'loading' | 'preview' | 'generation' | 'family-preview' | 'family-generation' | 'family-repair-preview' | 'family-repair-generation' | 'family-acceptance-preview' | 'family-acceptance' | 'family-bundle' | 'family-export' | 'repair-preview' | 'repair-generation' | 'acceptance' | 'bundle' | 'export' | null>('loading')
  const [error, setError] = useState<string | null>(null)
  const launchReferenceSeeded = useRef(false)
  const bundleRequest = useRef(0)
  const familyAbort = useRef<AbortController | null>(null)

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
          && servesQwenImage3(provider)
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

  useEffect(() => () => familyAbort.current?.abort(), [])
  useEffect(() => {
    setFamilyProductionInput(null)
    setFamilyAcceptancePreview(null)
    setFamilyAcceptance(null)
    setFamilyCompiled(null)
    setFamilyExportedDir(null)
  }, [familyPrepared, familyRepairs, familyResults, roleReviews])

  useEffect(() => {
    setPreviewOrdinal(0)
    const animation = compiled?.manifest.animations[0]
    if (!animation || animation.roleIds.length < 2
      || (typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return
    const timer = window.setInterval(() => {
      setPreviewOrdinal((current) => (current + 1) % animation.roleIds.length)
    }, animation.frameDurationMs)
    return () => window.clearInterval(timer)
  }, [compiled])

  const selectedProvider = providers.find((provider) => provider.id === providerId)
  const familyMode = launch?.intent.scope === 'action-family'
  const resetRun = useCallback(() => {
    familyAbort.current?.abort()
    familyAbort.current = null
    bundleRequest.current += 1
    setPrepared(null)
    setApplied(null)
    setAcceptance(null)
    setAccepted(null)
    setCompiled(null)
    setExportedDir(null)
    setRepairPrepared(null)
    setFamilyPrepared(null)
    setFamilyResults([])
    setFamilyActiveIndex(null)
    setFamilyRepairPrepared(null)
    setFamilyRepairs({})
    setRoleReviews({})
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
    const qwenModel = qwenImage3Route(selectedProvider)
    if (!referenceFile || !selectedProvider || !qwenModel) return
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
        model: qwenModel,
      })
      setPrepared(await prepareGameAssetProductionRehearsal(input))
      setApplied(null)
      setAcceptance(null)
      setAccepted(null)
      setCompiled(null)
      setExportedDir(null)
      bundleRequest.current += 1
      setRepairPrepared(null)
      setRoleReviews({})
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(null)
    }
  }

  const prepareFamily = async () => {
    const qwenModel = qwenImage3Route(selectedProvider)
    if (!referenceFile || !selectedProvider || !qwenModel) return
    if (kind !== 'player' && kind !== 'npc' && kind !== 'creature' && kind !== 'prop') {
      setError('Action families require a player, NPC, creature, or grounded prop identity.')
      return
    }
    setBusy('family-preview')
    setError(null)
    try {
      const authored = await authorGameAssetFamilyRun({
        assetName,
        sourceText: prompt,
        kind,
        view,
        direction,
        referenceFile,
        providerId: selectedProvider.id,
        model: qwenModel,
      })
      const previews: GameAssetActionSheetPreview[] = []
      for (const input of authored.previews) previews.push(await familyRunner.preview(input))
      setFamilyPrepared({ authored, previews })
      setFamilyResults([])
      setFamilyRepairPrepared(null)
      setFamilyRepairs({})
      setRoleReviews({})
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(null)
    }
  }

  const generateFamily = async (requestedStartIndex = 0) => {
    if (!familyPrepared) return
    const startIndex = Math.max(0, Math.min(requestedStartIndex, familyPrepared.previews.length))
    const controller = new AbortController()
    familyAbort.current?.abort()
    familyAbort.current = controller
    setBusy('family-generation')
    setError(null)
    setFamilyResults((current) => current.slice(0, startIndex))
    setFamilyRepairPrepared(null)
    setFamilyRepairs((current) => Object.fromEntries(
      Object.entries(current).filter(([groupId]) => (
        familyPrepared.authored.plan.groups.findIndex(({ id }) => id === groupId) < startIndex
      )),
    ))
    const settled: GameAssetActionSheetApplyResult[] = [...familyResults.slice(0, startIndex)]
    try {
      for (let index = startIndex; index < familyPrepared.previews.length; index += 1) {
        setFamilyActiveIndex(index)
        // Applying consumes a native preview. Re-preview the current group so a
        // timed-out or rejected group can resume without touching settled siblings.
        const preview = await familyRunner.preview(familyPrepared.authored.previews[index]!)
        const group = familyPrepared.authored.plan.groups[index]!
        const result = await familyRunner.apply(preview.planId, controller.signal)
        settled.push(result)
        setFamilyResults([...settled])
        if (result.status === 'succeeded' && result.source && result.clip && result.authorization) {
          await familyRunner.verify({
            authorization: result.authorization,
            plan: group.plan,
            source: result.source,
            clip: result.clip,
          })
          continue
        }
        if (result.status === 'partial' && result.source && result.partial && result.partialAuthorization) {
          await familyRunner.verifyPartial({
            authorization: result.partialAuthorization,
            plan: group.plan,
            source: result.source,
            partial: result.partial,
          })
          throw new Error(result.error)
        }
        throw new Error(result.error ?? `Action group ${group.label} did not settle.`)
      }
    } catch (reason) {
      if (!controller.signal.aborted) setError(message(reason))
    } finally {
      if (familyAbort.current === controller) familyAbort.current = null
      setFamilyActiveIndex(null)
      setBusy(null)
    }
  }

  const prepareFamilyRepair = async (groupIndex: number) => {
    if (!familyPrepared) return
    const group = familyPrepared.authored.plan.groups[groupIndex]
    const result = familyResults[groupIndex]
    if (!group || !result?.source) return
    if (familyRepairs[group.id]) {
      setError('This action already has an isolated repair. Regenerate the action group to establish a new repair parent.')
      return
    }
    setBusy('family-repair-preview')
    setError(null)
    try {
      const excludeDetachedVisual = group.component === 'body'
        && familyPrepared.authored.plan.groups.some((candidate) => (
          candidate.component === 'detached-fx'
          && candidate.synchronizedBodyGroupId === group.id
        ))
      if (result.status === 'partial' && result.partial && result.partialAuthorization) {
        if (!result.partial.frames.length) {
          throw new Error('Every cell failed native processing. Generate a fresh coherent source instead of replacing the complete action.')
        }
        const previewProviderRepair = () => familyRunner.previewPartialRepair({
          parentAuthorization: result.partialAuthorization!,
          parentSource: result.source!,
          parentPartial: result.partial!,
          runId: `run:game-family-partial-repair:${crypto.randomUUID()}`,
          plan: group.plan,
          roles: result.partial!.failures.map(({ roleId }) => {
            const role = group.plan.roles.find(({ id }) => id === roleId)!
            return {
              roleId,
              prompt: compileGameAssetActionSheetRepairPrompt({
                role,
                component: group.component,
                failed: true,
                excludeDetachedVisual,
              }),
            }
          }),
        })
        if (excludeDetachedVisual) {
          const preview = await previewProviderRepair()
          setFamilyRepairPrepared({ groupIndex, kind: 'partial', preview })
          return
        }
        try {
          const preview = await familyRunner.previewPartialReprocess({
            parentAuthorization: result.partialAuthorization,
            parentSource: result.source,
            parentPartial: result.partial,
            plan: group.plan,
          })
          setFamilyRepairPrepared({ groupIndex, kind: 'local', preview })
        } catch {
          const preview = await previewProviderRepair()
          setFamilyRepairPrepared({ groupIndex, kind: 'partial', preview })
        }
        return
      }
      if (result.status !== 'succeeded' || !result.clip || !result.authorization) return
      const replacementRoleIds = result.clip.frames
        .map(({ roleId }) => roleId)
        .filter((roleId) => roleReviews[roleId] === 'repair')
      if (!replacementRoleIds.length) return
      if (replacementRoleIds.length >= result.clip.frames.length) {
        throw new Error('Every cell was rejected. Generate a fresh coherent source instead of presenting a full replacement as targeted repair.')
      }
      const preview = await familyRunner.previewRepair({
        parentAuthorization: result.authorization,
        parentSource: result.source,
        parentClip: result.clip,
        runId: `run:game-family-repair:${crypto.randomUUID()}`,
        plan: group.plan,
        roles: replacementRoleIds.map((roleId) => {
          const role = group.plan.roles.find(({ id }) => id === roleId)!
          return {
            roleId,
            prompt: compileGameAssetActionSheetRepairPrompt({
              role,
              component: group.component,
              failed: false,
              excludeDetachedVisual,
            }),
          }
        }),
      })
      setFamilyRepairPrepared({ groupIndex, kind: 'complete', preview })
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(null)
    }
  }

  const generateFamilyRepair = async () => {
    if (!familyPrepared || !familyRepairPrepared) return
    const { groupIndex, preview } = familyRepairPrepared
    const group = familyPrepared.authored.plan.groups[groupIndex]
    const parent = familyResults[groupIndex]
    if (!group || !parent?.source) return
    const controller = new AbortController()
    familyAbort.current?.abort()
    familyAbort.current = controller
    setBusy('family-repair-generation')
    setError(null)
    try {
      if (familyRepairPrepared.kind === 'local') {
        if (parent.status !== 'partial' || !parent.partial || !parent.partialAuthorization) return
        const result = await familyRunner.applyPartialReprocess(preview.planId)
        if (result.status !== 'succeeded' || !result.authorization || !result.clip) {
          throw new Error(result.error ?? 'Local partial action-sheet cleanup did not settle.')
        }
        await familyRunner.verifyPartialReprocess({
          authorization: result.authorization,
          plan: group.plan,
          parentAuthorization: parent.partialAuthorization,
          parentSource: parent.source,
          parentPartial: parent.partial,
          clip: result.clip,
        })
        const merged = mergeGameAssetActionSheetPartialReprocess({
          source: parent.source,
          partial: parent.partial,
          authorization: parent.partialAuthorization,
        }, result)
        setFamilyRepairs((current) => ({ ...current, [group.id]: merged }))
        setRoleReviews((current) => {
          const next = { ...current }
          for (const roleId of merged.replacedRoleIds) delete next[roleId]
          return next
        })
        setFamilyRepairPrepared(null)
        return
      }
      if (familyRepairPrepared.kind === 'partial') {
        if (parent.status !== 'partial' || !parent.partial || !parent.partialAuthorization) return
        const result = await familyRunner.applyPartialRepair(preview.planId, controller.signal)
        if (result.status !== 'succeeded' || !result.authorization) {
          throw new Error(result.error ?? 'Partial action-sheet repair did not settle.')
        }
        await familyRunner.verifyPartialRepair({
          authorization: result.authorization,
          plan: group.plan,
          parentAuthorization: parent.partialAuthorization,
          parentSource: parent.source,
          parentPartial: parent.partial,
          outputs: result.outputs,
        })
        const merged = await mergeGameAssetActionSheetPartialRepair({
          source: parent.source,
          partial: parent.partial,
          authorization: parent.partialAuthorization,
          plan: group.plan,
        }, result)
        setFamilyRepairs((current) => ({ ...current, [group.id]: merged }))
        setRoleReviews((current) => {
          const next = { ...current }
          for (const roleId of merged.replacedRoleIds) delete next[roleId]
          return next
        })
        setFamilyRepairPrepared(null)
        return
      }
      if (parent.status !== 'succeeded' || !parent.clip || !parent.authorization) return
      const result = await familyRunner.applyRepair(preview.planId, controller.signal)
      if (result.status !== 'succeeded' || !result.authorization) {
        throw new Error(result.error ?? 'Action-sheet repair did not settle.')
      }
      await familyRunner.verifyRepair({
        authorization: result.authorization,
        plan: group.plan,
        parentAuthorization: parent.authorization,
        parentSource: parent.source,
        parentClip: parent.clip,
        outputs: result.outputs,
      })
      const merged = await mergeGameAssetActionSheetRepair({
        source: parent.source,
        clip: parent.clip,
        authorization: parent.authorization,
      }, result)
      setFamilyRepairs((current) => ({ ...current, [group.id]: merged }))
      setRoleReviews((current) => {
        const next = { ...current }
        for (const roleId of merged.replacedRoleIds) delete next[roleId]
        return next
      })
      setFamilyRepairPrepared(null)
    } catch (reason) {
      if (!controller.signal.aborted) setError(message(reason))
    } finally {
      if (familyAbort.current === controller) familyAbort.current = null
      setBusy(null)
    }
  }

  const buildFamilyProductionInput = (): GameAssetFamilyProductionInput => {
    if (!familyPrepared || familyResults.length !== familyPrepared.authored.plan.groups.length) {
      throw new Error('Game Asset family production evidence is incomplete.')
    }
    const retainedEvidence = familyPrepared.authored.plan.groups.map((group, index) => {
      const result = familyResults[index]
      const repair = familyRepairs[group.id]
      if (!result?.source) throw new Error(`Game Asset family group ${group.label} has no retained source.`)
      if (!repair) {
        if (result.status !== 'succeeded' || !result.authorization || !result.clip) {
          throw new Error(`Game Asset family group ${group.label} has no complete native authority.`)
        }
        return {
          kind: 'coherent-sheet',
          evidence: {
            authorization: result.authorization,
            source: result.source,
            clip: result.clip,
          },
        }
      }
      if (repair.authorization.executionMode === 'local-deterministic') {
        if (result.status !== 'partial' || !result.partialAuthorization || !result.partial) {
          throw new Error(`Game Asset family group ${group.label} lost its signed partial parent.`)
        }
        return {
          kind: 'local-partial-reprocess',
          evidence: {
            parentAuthorization: result.partialAuthorization,
            parentSource: result.source,
            parentPartial: result.partial,
            reprocessAuthorization: repair.authorization,
            clip: repair.clip,
          },
        }
      }
      if (!('outputs' in repair)) {
        throw new Error(`Game Asset family group ${group.label} repair outputs are unavailable.`)
      }
      if (result.status === 'partial' && result.partialAuthorization && result.partial) {
        return {
          kind: 'partial-sheet-repair',
          evidence: {
            parentAuthorization: result.partialAuthorization,
            parentSource: result.source,
            parentPartial: result.partial,
            repairAuthorization: repair.authorization,
            outputs: repair.outputs,
          },
        }
      }
      if (result.status === 'succeeded' && result.authorization && result.clip) {
        return {
          kind: 'complete-sheet-repair',
          evidence: {
            parentAuthorization: result.authorization,
            parentSource: result.source,
            parentClip: result.clip,
            repairAuthorization: repair.authorization,
            outputs: repair.outputs,
          },
        }
      }
      throw new Error(`Game Asset family group ${group.label} repair parent is invalid.`)
    })
    return gameAssetFamilyProductionInputSchema.parse({
      familyPlan: familyPrepared.authored.plan,
      retainedEvidence,
      decisions: familyPrepared.authored.plan.groups.flatMap((group) => (
        group.plan.roles.map((role) => ({
          groupId: group.id,
          roleId: role.id,
          referenceContinuity: 'accepted',
          roleReadability: 'accepted',
          styleConsistency: 'accepted',
        }))
      )),
    })
  }

  const prepareFamilyAcceptance = async () => {
    setBusy('family-acceptance-preview')
    setError(null)
    try {
      const input = buildFamilyProductionInput()
      const preview = await familyProductionRunner.preview(input)
      setFamilyProductionInput(input)
      setFamilyAcceptancePreview(preview)
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(null)
    }
  }

  const acceptFamily = async () => {
    if (!familyAcceptancePreview || !familyProductionInput) return
    setBusy('family-acceptance')
    setError(null)
    try {
      const acceptedFamily = await familyProductionRunner.apply(familyAcceptancePreview.previewId)
      const verified = await familyProductionRunner.verify(acceptedFamily, familyProductionInput)
      setFamilyAcceptance(verified)
      setFamilyCompiled(null)
      setFamilyExportedDir(null)
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(null)
    }
  }

  const compileFamily = async () => {
    if (!familyAcceptance || !familyProductionInput) return
    setBusy('family-bundle')
    setError(null)
    try {
      const first = await familyProductionRunner.compile(familyAcceptance, familyProductionInput)
      const second = await familyProductionRunner.compile(familyAcceptance, familyProductionInput)
      if (first.bundleHash !== second.bundleHash
        || first.manifestBytesBase64 !== second.manifestBytesBase64
        || first.atlases.length !== second.atlases.length
        || first.atlases.some((atlas, index) => atlas.sha256 !== second.atlases[index]?.sha256)) {
        throw new Error('Game Asset family compiler did not reproduce identical atlas and manifest identities.')
      }
      setFamilyCompiled(first)
      setFamilyExportedDir(null)
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(null)
    }
  }

  const exportFamily = async () => {
    if (!familyCompiled) return
    setBusy('family-export')
    setError(null)
    try {
      const files = [
        ...familyCompiled.atlases.map((atlas) => ({
          path: atlas.logicalPath,
          content: base64ToBytes(atlas.bytesBase64),
        })),
        {
          path: familyCompiled.manifestLogicalPath,
          content: base64ToBytes(familyCompiled.manifestBytesBase64),
        },
      ]
      const result = await services.bundles.save({
        name: `game-asset-family-${familyCompiled.bundleHash.slice(0, 12)}`,
        files,
      })
      if (!result.ok) throw new Error(result.error)
      if (result.data.canceled) return
      const receipts = new Map(result.data.files.map((file) => [file.path, file.sha256]))
      if (receipts.get(familyCompiled.manifestLogicalPath) !== familyCompiled.bundleHash
        || familyCompiled.atlases.some((atlas) => receipts.get(atlas.logicalPath) !== atlas.sha256)) {
        throw new Error('Exported Game Asset family files do not match their compiled content identities.')
      }
      setFamilyExportedDir(result.data.bundleDir)
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
      || applied.bundle.frames.some(({ roleId }) => roleReviews[roleId] !== 'accepted')) return
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

  const prepareRepair = async () => {
    if (applied?.status !== 'deterministic-evidence-verified') return
    const roleIds = applied.bundle.frames
      .map(({ roleId }) => roleId)
      .filter((roleId) => roleReviews[roleId] === 'repair')
    if (!roleIds.length
      || applied.bundle.frames.some(({ roleId }) => !roleReviews[roleId])) return
    setBusy('repair-preview')
    setError(null)
    try {
      const requests = new Map(applied.bundle.authorization.roleRequests.map((request) => [request.roleId, request]))
      setRepairPrepared(await prepareGameAssetProductionRepair(
        applied,
        roleIds.map((roleId) => ({
          roleId,
          prompt: `${requests.get(roleId)?.prompt ?? prompt}\nRepair this exact role only. Render exactly ONE complete character in exactly ONE pose; no duplicate subject, sprite sheet, sequence, comparison, or contact sheet. Preserve the locked identity, proportions, clothing, palette, view, action, direction, scale, and anchor.`,
        })),
      ))
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(null)
    }
  }

  const generateRepair = async () => {
    if (!repairPrepared) return
    setBusy('repair-generation')
    setError(null)
    try {
      const result = await applyPreparedGameAssetProductionRepair(repairPrepared)
      if (result.status === 'partial') {
        setError(result.error)
        return
      }
      setApplied(result)
      setRepairPrepared(null)
      setAcceptance(null)
      setAccepted(null)
      setCompiled(null)
      setExportedDir(null)
      bundleRequest.current += 1
      setRoleReviews({})
      await repository.save(assetName, result.bundle)
      await refreshHistory()
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
      const request = ++bundleRequest.current
      const compiledBundle = await compileGameAssetProductionBundle(result.bundle)
      if (request === bundleRequest.current) setCompiled(compiledBundle)
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(null)
    }
  }

  const buildAtlas = async () => {
    if (!displayed?.semanticAcceptance) return
    const request = ++bundleRequest.current
    setBusy('bundle')
    setError(null)
    try {
      const compiledBundle = await compileGameAssetProductionBundle(displayed)
      if (request === bundleRequest.current) setCompiled(compiledBundle)
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(null)
    }
  }

  const downloadCompiled = (kind: 'atlas' | 'manifest') => {
    if (!compiled) return
    const link = document.createElement('a')
    link.href = kind === 'atlas'
      ? frameUrl(compiled.atlasBytesBase64)
      : `data:application/json;base64,${compiled.manifestBytesBase64}`
    link.download = kind === 'atlas' ? 'atlas.png' : 'manifest.json'
    link.click()
  }

  const exportCompiled = async () => {
    if (!compiled || compiled.deliveryStatus !== 'accepted') return
    const request = bundleRequest.current
    setBusy('export')
    setError(null)
    try {
      const result = await services.bundles.save({
        name: `game-asset-${compiled.bundleHash.slice(0, 12)}`,
        files: [{
          path: compiled.manifest.atlas.logicalPath,
          content: base64ToBytes(compiled.atlasBytesBase64),
        }, {
          path: compiled.manifestLogicalPath,
          content: base64ToBytes(compiled.manifestBytesBase64),
        }],
      })
      if (!result.ok) throw new Error(result.error)
      if (result.data.canceled) return
      const receipts = new Map(result.data.files.map((file) => [file.path, file]))
      if (receipts.get(compiled.manifest.atlas.logicalPath)?.sha256 !== compiled.manifest.atlas.sha256
        || receipts.get(compiled.manifestLogicalPath)?.sha256 !== compiled.bundleHash) {
        throw new Error('Exported Game Asset bundle does not match its compiled content identities.')
      }
      if (request === bundleRequest.current) setExportedDir(result.data.bundleDir)
    } catch (reason) {
      setError(message(reason))
    } finally {
      setBusy(null)
    }
  }

  const loadRetained = async (id: string) => {
    const request = ++bundleRequest.current
    setBusy('loading')
    setError(null)
    setPrepared(null)
    setApplied(null)
    setAcceptance(null)
    setAccepted(null)
    setCompiled(null)
    setExportedDir(null)
    setRepairPrepared(null)
    setRoleReviews({})
    setLoaded(null)
    try {
      const rehearsal = await repository.load(id)
      if (request === bundleRequest.current) setLoaded(rehearsal)
    } catch (reason) {
      if (request === bundleRequest.current) setError(message(reason))
    } finally {
      if (request === bundleRequest.current) setBusy(null)
    }
  }

  const displayed = accepted?.bundle
    ?? (applied?.status === 'deterministic-evidence-verified' ? applied.bundle : null)
    ?? loaded?.bundle
  const evaluation = accepted?.verified.evaluation
    ?? (applied?.status === 'deterministic-evidence-verified' ? applied.verified.evaluation : null)
    ?? loaded?.verified.evaluation
  const semanticAccepted = Boolean(accepted
    || loaded?.verified.semanticAcceptanceClosure.status === 'complete')
  const previewAnimation = compiled?.manifest.animations[0]
  const previewRoleId = previewAnimation
    ? previewAnimation.roleIds[previewOrdinal % previewAnimation.roleIds.length]
    : undefined
  const previewFrame = compiled?.manifest.frames.find(({ roleId }) => roleId === previewRoleId)
  const familyActiveGroup = familyActiveIndex === null
    ? null
    : familyPrepared?.authored.plan.groups[familyActiveIndex]
  const familyFailureIndex = familyResults.findIndex((result, index) => {
    const groupId = familyPrepared?.authored.plan.groups[index]?.id
    return result.status !== 'succeeded' && (!groupId || !familyRepairs[groupId])
  })
  const familyResumeIndex = familyFailureIndex >= 0 ? familyFailureIndex : familyResults.length
  const familyComplete = Boolean(familyPrepared
    && familyResults.length === familyPrepared.previews.length
    && familyFailureIndex < 0)
  const familyFailureGroup = familyFailureIndex >= 0
    ? familyPrepared?.authored.plan.groups[familyFailureIndex]
    : null
  const familyActionStates = useMemo(() => {
    if (!familyPrepared) return []
    const repairedRoleIds = new Map(Object.entries(familyRepairs).map(([groupId, repair]) => (
      [groupId, repair.replacedRoleIds] as const
    )))
    const clipOverrides = new Map(Object.entries(familyRepairs).map(([groupId, repair]) => (
      [groupId, repair.clip] as const
    )))
    return projectGameAssetFamilyActionStates(
      familyPrepared.authored.plan,
      familyResults,
      repairedRoleIds,
      clipOverrides,
    )
  }, [familyPrepared, familyRepairs, familyResults])
  const visibleFamilyActionStates = familyActionStates.slice(0, familyResults.length)
  const familyAllReviewed = familyComplete && visibleFamilyActionStates.every(({ clip }) => (
    clip?.frames.every(({ roleId }) => roleReviews[roleId] === 'accepted')
  ))

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4" data-slot="game-asset-production">
      <div className="flex min-w-0 items-center gap-3 border-b border-border pb-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
          <Gamepad2 className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Game asset production</h3>
          <p className="truncate text-xs text-muted-foreground">
            {familyMode
              ? 'Action family recognized · coherent Qwen sheets · retained source lineage'
              : launch ? 'Intent recognized · review before generation' : 'Native generation · deterministic Cutout · signed review'}
          </p>
        </div>
        {(prepared || displayed || familyPrepared || familyResults.length > 0) ? (
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
              <Input value={assetName} onChange={(event) => { setAssetName(event.target.value); resetRun() }} placeholder="Hero, creature, or prop" />
            </Field>
            <Field label="Provider">
              <Select value={providerId} onValueChange={(value) => { setProviderId(value); resetRun() }}>
                <SelectTrigger><SelectValue placeholder="No Qwen image Provider" /></SelectTrigger>
                <SelectContent>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>{provider.label} · {qwenImage3Route(provider)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Asset type">
              <Select value={kind} onValueChange={(value) => { setKind(value as typeof kind); resetRun() }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(familyMode
                  ? ['player', 'npc', 'creature', 'prop']
                  : ['player', 'npc', 'creature', 'prop', 'fx']
                ).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="View">
              <Select value={view} onValueChange={(value) => { setView(value as typeof view); resetRun() }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{['side', 'topdown', 'three-quarter'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            {!familyMode ? (
              <Field label="Action">
                <Select value={action} onValueChange={(value) => { setAction(value as typeof action); resetRun() }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['single', 'idle', 'walk', 'run', 'attack', 'cast', 'jump', 'hurt', 'death'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            ) : null}
            <Field label="Direction">
              <Select value={direction} onValueChange={(value) => { setDirection(value as typeof direction); resetRun() }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{['none', 'down', 'left', 'right', 'up'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            {!familyMode ? (
              <>
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
              </>
            ) : null}
            <div className="sm:col-span-2">
              <Field label={familyMode ? 'Intent' : 'Direction prompt'}>
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

      {familyMode && familyPrepared ? (
        <div className="flex flex-wrap items-center gap-2 border-y border-border py-3">
          <Badge variant="outline">{familyPrepared.authored.plan.groups.length} actions</Badge>
          <Badge variant="outline">{familyPrepared.previews.reduce((roles, preview) => roles + preview.roleIds.length, 0)} frames</Badge>
          <Badge variant="outline">{familyPrepared.previews[0]?.model}</Badge>
          <Badge variant="outline">1 source call / action</Badge>
          <Button type="button" className="ml-auto" onClick={() => void generateFamily(familyResumeIndex)} disabled={Boolean(busy) || familyComplete}>
            {busy === 'family-generation' ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
            {busy === 'family-generation' && familyActiveGroup
              ? `${familyActiveGroup.label} ${(familyActiveIndex ?? 0) + 1}/${familyPrepared.previews.length}`
              : familyFailureGroup
                ? `Retry ${familyFailureGroup.label}`
                : familyComplete
                  ? familyAllReviewed ? 'Reviews complete' : 'Sources ready · review pending'
                  : 'Generate family'}
          </Button>
          {busy === 'family-generation' ? (
            <Button type="button" variant="outline" size="icon" onClick={() => familyAbort.current?.abort()} title="Cancel generation">
              <Square className="size-4" />
            </Button>
          ) : null}
        </div>
      ) : familyMode && !displayed ? (
        <div className="flex justify-end">
          <Button type="button" onClick={() => void prepareFamily()} disabled={Boolean(busy) || !referenceFile || !assetName.trim() || !prompt.trim() || !selectedProvider}>
            {busy === 'family-preview' ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            Preview action family
          </Button>
        </div>
      ) : prepared && !displayed ? (
        <div className="flex flex-wrap items-center gap-2 border-y border-border py-3">
          <Badge variant="outline">{prepared.preview.roleIds.length} roles</Badge>
          <Badge variant="outline">{prepared.preview.outputSize}</Badge>
          <Badge variant="outline">{prepared.preview.model}</Badge>
          <Badge variant="outline">v5 Cutout</Badge>
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

      {visibleFamilyActionStates.length ? (
        <div className="divide-y divide-border border-y border-border">
          {visibleFamilyActionStates.map(({ group, result, clip, repairedRoleIds }, index) => {
            const repaired = familyRepairs[group.id]
            const localReprocess = repaired?.authorization.executionMode === 'local-deterministic'
            const groupReviewsComplete = Boolean(clip?.frames.every(({ roleId }) => roleReviews[roleId]))
            const groupRepairCount = clip?.frames.filter(({ roleId }) => roleReviews[roleId] === 'repair').length ?? 0
            const repairPreparedForGroup = familyRepairPrepared?.groupIndex === index
            return (
              <section key={group.id} className="py-4">
                <div className="mb-3 flex min-w-0 items-center gap-2">
                  <h4 className="truncate text-sm font-medium">{group.label}</h4>
                  <Badge variant={result.status === 'succeeded' || repaired ? 'outline' : 'destructive'}>
                    {repaired
                      ? `${localReprocess ? 'Local cleanup' : 'Repair'} verified · review pending`
                      : result.status === 'succeeded'
                        ? 'Source verified · review pending'
                        : result.status === 'partial'
                          ? 'Partial · failed cells retained'
                          : 'Failed'}
                  </Badge>
                  {result.source ? <Badge variant="outline">1 signed source</Badge> : null}
                  {repairedRoleIds.length ? (
                    <Badge variant="outline">
                      {repairedRoleIds.length} {localReprocess ? 'local cleanup' : 'isolated repair'}
                    </Badge>
                  ) : null}
                  {clip ? <span className="ml-auto text-xs text-muted-foreground">{clip.frames.length} frames</span> : null}
                </div>
                {result.source && clip ? (
                  <div className="grid gap-3 lg:grid-cols-[minmax(180px,0.7fr)_minmax(0,1.3fr)]">
                    <div className="min-w-0 border border-border bg-muted/20 p-2">
                      <img
                        src={`data:${result.source.source.mediaType};base64,${result.source.source.bytesBase64}`}
                        alt={`${group.label} coherent source`}
                        className="w-full object-contain"
                      />
                      <p className="mt-2 truncate text-xs text-muted-foreground">
                        {result.source.grid.rows}×{result.source.grid.columns} · retained source
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {clip.frames.map((frame) => {
                        const review = roleReviews[frame.roleId]
                        return (
                          <div key={frame.roleId} className="min-w-0 border border-border bg-muted/20 p-1.5">
                            <img src={frameUrl(frame.artifactBytesBase64)} alt={frame.roleId} className="aspect-square w-full object-contain" />
                            <p className="mt-1 truncate text-[11px] text-muted-foreground">{frame.roleId}</p>
                            <div className="mt-1.5 grid grid-cols-2 gap-1">
                              <Button type="button" size="sm" variant={review === 'accepted' ? 'secondary' : 'outline'} onClick={() => {
                                if (repairPreparedForGroup) setFamilyRepairPrepared(null)
                                setRoleReviews((current) => ({ ...current, [frame.roleId]: 'accepted' }))
                              }}>
                                <Check className="size-3.5" /> Keep
                              </Button>
                              <Button type="button" size="sm" variant={review === 'repair' ? 'destructive' : 'outline'} onClick={() => {
                                if (repairPreparedForGroup) setFamilyRepairPrepared(null)
                                setRoleReviews((current) => ({ ...current, [frame.roleId]: 'repair' }))
                              }}>
                                <RotateCcw className="size-3.5" /> Repair
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : result.source && result.partial ? (
                  <div className="grid gap-3 lg:grid-cols-[minmax(180px,0.7fr)_minmax(0,1.3fr)]">
                    <div className="min-w-0 border border-destructive/30 bg-destructive/5 p-2">
                      <img
                        src={`data:${result.source.source.mediaType};base64,${result.source.source.bytesBase64}`}
                        alt={`${group.label} retained partial source`}
                        className="w-full object-contain"
                      />
                      <p className="mt-2 text-xs text-destructive">
                        Source verified · {result.partial.failures.length} cell{result.partial.failures.length === 1 ? '' : 's'} blocked
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {group.plan.roles.map((role) => {
                        const frame = result.partial?.frames.find(({ roleId }) => roleId === role.id)
                        const failure = result.partial?.failures.find(({ roleId }) => roleId === role.id)
                        const cell = result.source?.cells.find(({ roleId }) => roleId === role.id)
                        const review = roleReviews[role.id]
                        return (
                          <div key={role.id} className={`min-w-0 border p-1.5 ${failure ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-muted/20'}`}>
                            {frame ? (
                              <img src={frameUrl(frame.artifactBytesBase64)} alt={role.id} className="aspect-square w-full object-contain" />
                            ) : cell ? (
                              <img src={`data:${cell.artifact.mediaType};base64,${cell.artifact.bytesBase64}`} alt={`${role.id} failed source cell`} className="aspect-square w-full object-contain" />
                            ) : null}
                            <p className="mt-1 truncate text-[11px] text-muted-foreground">{role.id}</p>
                            {failure ? (
                              <p className="mt-1 text-[11px] text-destructive">Native repair required</p>
                            ) : frame ? (
                              <div className="mt-1.5 grid grid-cols-2 gap-1">
                                <Button type="button" size="sm" variant={review === 'accepted' ? 'secondary' : 'outline'} onClick={() => {
                                  setRoleReviews((current) => ({ ...current, [role.id]: 'accepted' }))
                                }}>
                                  <Check className="size-3.5" /> Keep
                                </Button>
                                <Button type="button" size="sm" variant={review === 'repair' ? 'destructive' : 'outline'} disabled>
                                  <RotateCcw className="size-3.5" /> Repair
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : result.source ? (
                  <div className="grid gap-3 lg:grid-cols-[minmax(180px,0.7fr)_minmax(0,1.3fr)]">
                    <div className="min-w-0 border border-destructive/30 bg-destructive/5 p-2">
                      <img
                        src={`data:${result.source.source.mediaType};base64,${result.source.source.bytesBase64}`}
                        alt={`${group.label} retained failed source`}
                        className="w-full object-contain"
                      />
                      <p className="mt-2 text-xs text-destructive">Source retained · clip not issued</p>
                    </div>
                    {result.error ? <p className="text-xs text-destructive">{result.error}</p> : null}
                  </div>
                ) : result.error ? <p className="text-xs text-destructive">{result.error}</p> : null}
                {clip && groupRepairCount > 0 ? (
                  <div className="mt-3 flex justify-end border-t border-border pt-3">
                    {repaired ? (
                      <p className="text-xs text-destructive">A repaired cell was rejected. This group needs a fresh source run.</p>
                    ) : repairPreparedForGroup ? (
                      <Button type="button" onClick={() => void generateFamilyRepair()} disabled={Boolean(busy)}>
                        {busy === 'family-repair-generation' ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
                        {familyRepairPrepared.kind === 'local' ? 'Apply local cleanup' : 'Repair'} {preparedFamilyRepairRoleIds(familyRepairPrepared).length} cell{preparedFamilyRepairRoleIds(familyRepairPrepared).length === 1 ? '' : 's'}
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" onClick={() => void prepareFamilyRepair(index)} disabled={Boolean(busy) || !groupReviewsComplete}>
                        {busy === 'family-repair-preview' ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                        Preview cell repair
                      </Button>
                    )}
                  </div>
                ) : result.status === 'partial' && result.partial && !repaired ? (
                  <div className="mt-3 flex justify-end border-t border-border pt-3">
                    {repairPreparedForGroup ? (
                      <Button type="button" onClick={() => void generateFamilyRepair()} disabled={Boolean(busy)}>
                        {busy === 'family-repair-generation' ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
                        {familyRepairPrepared.kind === 'local' ? 'Apply local cleanup' : 'Repair'} {preparedFamilyRepairRoleIds(familyRepairPrepared).length} cell{preparedFamilyRepairRoleIds(familyRepairPrepared).length === 1 ? '' : 's'}
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" onClick={() => void prepareFamilyRepair(index)} disabled={Boolean(busy)}>
                        {busy === 'family-repair-preview' ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                        Preview local cleanup
                      </Button>
                    )}
                  </div>
                ) : null}
              </section>
            )
          })}
        </div>
      ) : null}

      {familyAllReviewed ? (
        <div className="flex flex-wrap items-center gap-2 border-y border-border py-3 text-xs">
          <ShieldCheck className="size-4 text-muted-foreground" />
          <span>{familyAcceptance ? 'Family acceptance verified' : 'Every action cell is reviewed'}</span>
          {!familyAcceptancePreview && !familyAcceptance ? (
            <Button type="button" className="ml-auto" onClick={() => void prepareFamilyAcceptance()} disabled={Boolean(busy)}>
              {busy === 'family-acceptance-preview' ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              Preview family acceptance
            </Button>
          ) : familyAcceptancePreview && !familyAcceptance ? (
            <Button type="button" className="ml-auto" onClick={() => void acceptFamily()} disabled={Boolean(busy)}>
              {busy === 'family-acceptance' ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}
              Accept {familyAcceptancePreview.clips.length} actions
            </Button>
          ) : familyAcceptance && !familyCompiled ? (
            <Button type="button" className="ml-auto" onClick={() => void compileFamily()} disabled={Boolean(busy)}>
              {busy === 'family-bundle' ? <LoaderCircle className="size-4 animate-spin" /> : <Gamepad2 className="size-4" />}
              Compile family
            </Button>
          ) : null}
        </div>
      ) : null}

      {familyCompiled ? (
        <section className="space-y-3 border-b border-border pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Accepted family</Badge>
            <Badge variant="outline">{familyCompiled.manifest.animations.length} animations</Badge>
            <Badge variant="outline">{familyCompiled.atlases.length} atlas{familyCompiled.atlases.length === 1 ? '' : 'es'}</Badge>
            <Button type="button" className="ml-auto" onClick={() => void exportFamily()} disabled={Boolean(busy)}>
              {busy === 'family-export' ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
              Export family
            </Button>
          </div>
          <FamilyBundlePlayback bundle={familyCompiled} />
          {familyExportedDir ? <p className="truncate text-xs text-muted-foreground">{familyExportedDir}</p> : null}
        </section>
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
            <Badge variant={semanticAccepted ? 'secondary' : 'outline'}>
              {semanticAccepted ? 'Semantic evidence verified' : 'Semantic review pending'}
            </Badge>
            <Badge variant={evaluation?.status === 'passed' ? 'secondary' : 'destructive'}>{evaluation?.status ?? 'blocked'}</Badge>
            <span className="ml-auto text-xs text-muted-foreground">{displayed.runId}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {displayed.frames.map((frame) => {
              const review = roleReviews[frame.roleId]
              return (
                <div key={frame.roleId} className="min-w-0 border border-border bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(-45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(45deg,transparent_75%,hsl(var(--muted))_75%),linear-gradient(-45deg,transparent_75%,hsl(var(--muted))_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px]">
                  <img src={frameUrl(frame.artifactBytesBase64)} alt={frame.roleId} className="aspect-square w-full object-contain" />
                  <div className="border-t border-border bg-background p-2">
                    <p className="truncate text-xs font-medium">{frame.roleId}</p>
                    {!accepted && !loaded ? (
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        <Button type="button" size="sm" variant={review === 'accepted' ? 'secondary' : 'outline'} onClick={() => {
                          setRepairPrepared(null)
                          setRoleReviews((current) => ({ ...current, [frame.roleId]: 'accepted' }))
                        }}>
                          <Check className="size-3.5" /> Keep
                        </Button>
                        <Button type="button" size="sm" variant={review === 'repair' ? 'destructive' : 'outline'} onClick={() => {
                          setRepairPrepared(null)
                          setRoleReviews((current) => ({ ...current, [frame.roleId]: 'repair' }))
                        }}>
                          <RotateCcw className="size-3.5" /> Regenerate
                        </Button>
                      </div>
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
              {repairPrepared ? (
                <Button type="button" onClick={() => void generateRepair()} disabled={Boolean(busy)}>
                  {busy === 'repair-generation' ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />}
                  Regenerate {repairPrepared.preview.replacementRoleIds.length}
                </Button>
              ) : Object.values(roleReviews).includes('repair') ? (
                <Button type="button" variant="outline" onClick={() => void prepareRepair()} disabled={Boolean(busy) || displayed.frames.some(({ roleId }) => !roleReviews[roleId])}>
                  {busy === 'repair-preview' ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                  Preview repair
                </Button>
              ) : acceptance ? (
                <Button type="button" onClick={() => void confirmAcceptance()} disabled={Boolean(busy)}>
                  {busy === 'acceptance' ? <LoaderCircle className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                  Confirm acceptance
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={() => void prepareAcceptance()} disabled={Boolean(busy) || displayed.frames.some(({ roleId }) => roleReviews[roleId] !== 'accepted')}>
                  <Check className="size-4" />
                  Preview acceptance
                </Button>
              )}
            </div>
          ) : null}
          {semanticAccepted ? (
            <div className="border-t border-border pt-3">
              {compiled ? (
                <>
                  <div className="grid gap-3 lg:grid-cols-[minmax(180px,0.28fr)_minmax(0,1fr)]">
                    <div
                      aria-label="Runtime animation preview"
                      className="aspect-square w-full bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(-45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(45deg,transparent_75%,hsl(var(--muted))_75%),linear-gradient(-45deg,transparent_75%,hsl(var(--muted))_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px] bg-no-repeat"
                      style={previewFrame ? {
                        backgroundImage: `url(${frameUrl(compiled.atlasBytesBase64)})`,
                        backgroundSize: `${compiled.manifest.atlas.columns * 100}% ${compiled.manifest.atlas.rows * 100}%`,
                        backgroundPosition: `${compiled.manifest.atlas.columns === 1 ? 0 : (previewFrame.cell.x / (compiled.manifest.atlas.width - previewFrame.cell.width)) * 100}% ${compiled.manifest.atlas.rows === 1 ? 0 : (previewFrame.cell.y / (compiled.manifest.atlas.height - previewFrame.cell.height)) * 100}%`,
                      } : undefined}
                    />
                    <div className="flex min-w-0 items-center overflow-hidden bg-[linear-gradient(45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(-45deg,hsl(var(--muted))_25%,transparent_25%),linear-gradient(45deg,transparent_75%,hsl(var(--muted))_75%),linear-gradient(-45deg,transparent_75%,hsl(var(--muted))_75%)] bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0px]">
                      <img
                        src={frameUrl(compiled.atlasBytesBase64)}
                        alt="Compiled animation atlas"
                        className="w-full object-contain"
                        style={{ aspectRatio: `${compiled.manifest.atlas.width} / ${compiled.manifest.atlas.height}` }}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">Runtime bundle</Badge>
                    <Badge variant="outline">{compiled.manifest.atlas.width}×{compiled.manifest.atlas.height}</Badge>
                    <Badge variant="outline">{compiled.manifest.animations.length} animation</Badge>
                    <div className="ml-auto flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => downloadCompiled('atlas')}>
                        <Download className="size-3.5" /> Atlas
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => downloadCompiled('manifest')}>
                        <Download className="size-3.5" /> Manifest
                      </Button>
                      <Button type="button" size="sm" onClick={() => void exportCompiled()} disabled={Boolean(busy)}>
                        {busy === 'export' ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                        Export
                      </Button>
                    </div>
                  </div>
                  {exportedDir ? <p className="mt-2 truncate text-xs text-muted-foreground">{exportedDir}</p> : null}
                </>
              ) : (
                <div className="flex justify-end">
                  <Button type="button" onClick={() => void buildAtlas()} disabled={Boolean(busy)}>
                    {busy === 'bundle' ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
                    Build atlas
                  </Button>
                </div>
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
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => {
                  void loadRetained(record.id)
                }}>
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
