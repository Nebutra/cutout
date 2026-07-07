/**
 * AI Native control bridge.
 *
 * The running app owns browser-only state and AI service hooks, so external
 * agents send JSON commands through Tauri's file queue. This hook is the one
 * in-process dispatcher that turns those commands into existing store actions
 * and React Query mutations.
 */
import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api/core'
import { ZodError } from 'zod'
import { useServices } from '@/services/context'
import type { ServiceRegistry } from '@/services/types'
import { getStoreState, useStore } from '@/store'
import type { ParamKey } from '@/store/types'
import {
  baseName,
  blobToBytes,
  bitmapToBytes,
  bytesToBlob,
  decodeImage,
  isSupportedImage,
} from '@/lib/image'
import {
  isDesignMarkdownFileName,
  normalizedDesignMarkdown,
} from '@/prototype/design-md'
import { clearAssignment } from '@/services/ai/model-assignment.local'
import type { ModelAssignments } from '@/services/ai/model-assignment-types'
import { isErr } from '@/services/types'
import {
  planSemanticSlices,
  runSemanticSliceExperiment,
  type SemanticSliceArtifact,
} from '@/services/ai/semantic-slices'
import { planPrototype } from '@/prototype/planner'
import {
  createAiNativeDiagnosticsSnapshot,
  createAiNativeSnapshot,
  parseAiNativeAction,
  PARAM_KEYS,
  resetAiNativeDiagnosticsSnapshot,
  validateParamValue,
  type AiNativeCommandEnvelope,
  type AiNativeCommandResult,
} from '@/services/ai-native/actions'
import {
  useComposeMockup,
  useDeconstructMockup,
  useGenerateMockup,
  useNameSlices,
} from './queries/pipeline'
import { useReRunSubtree, useRunPlan } from './queries/dag'
import {
  aiSettingsKeys,
  useModelAssignments,
  useSetModelAssignment,
} from './queries/ai-settings'
import {
  useRemoveProvider,
  useSetKey,
  useTestKey,
  useUpsertProvider,
} from './queries/providers'

const POLL_INTERVAL_MS = 500
const DEFAULT_QUEUE_LIMIT = 8

interface AiNativeControlOptions {
  readonly analyze: (wantSlices: boolean) => void
}

interface AiNativeDebugBridge {
  dispatch(action: unknown): Promise<unknown>
  getState(): unknown
}

interface AiNativeFilePayload {
  readonly name: string
  readonly mediaType: string
  readonly bytes: readonly number[]
}

interface AiNativeWrittenArtifact {
  readonly path: string
  readonly name: string
  readonly mediaType: string
  readonly byteLength: number
}

interface ModelAssignmentReader {
  readonly data?: ModelAssignments
  refetch(): Promise<{ data?: ModelAssignments }>
}

type SemanticReferenceMode = 'auto' | 'none' | 'mockup' | 'board'

interface SemanticReferenceRequest {
  readonly reference?: SemanticReferenceMode
  readonly referencePath?: string
  readonly sourceKind?: 'brief' | 'mockup' | 'board' | 'mixed'
}

interface SemanticReferenceResult {
  readonly bytes?: Uint8Array
  readonly sourceKind: 'brief' | 'mockup' | 'board' | 'mixed'
  readonly source: 'none' | 'mockup' | 'board' | 'file'
}

interface ResolvedModel {
  readonly providerId: string
  readonly model?: string
}

declare global {
  interface Window {
    __CUTOUT_AI__?: AiNativeDebugBridge
  }
}

export function useAiNativeControl({ analyze }: AiNativeControlOptions): void {
  const services = useServices()
  const queryClient = useQueryClient()
  const busyRef = useRef(false)
  const modelAssignments = useModelAssignments()
  const { mutateAsync: setModelAssignment } = useSetModelAssignment()
  const { mutateAsync: upsertProvider } = useUpsertProvider()
  const { mutateAsync: removeProvider } = useRemoveProvider()
  const { mutateAsync: setProviderKey } = useSetKey()
  const { mutateAsync: testProvider } = useTestKey()
  const { mutateAsync: generateMockup } = useGenerateMockup()
  const { mutateAsync: deconstructMockup } = useDeconstructMockup()
  const { mutateAsync: composeMockup } = useComposeMockup()
  const { mutateAsync: runPlan } = useRunPlan()
  const { mutateAsync: reRunSubtree } = useReRunSubtree()
  const { mutateAsync: nameSlices } = useNameSlices()

  const execute = useCallback(
    async (rawAction: unknown): Promise<unknown> => {
      const action = parseAiNativeAction(rawAction)
      switch (action.type) {
        case 'ping':
          return { pong: true }

        case 'get-state':
        case 'snapshot':
          return createAiNativeSnapshot(getStoreState())

        case 'get-diagnostics':
          return createAiNativeDiagnosticsSnapshot()

        case 'clear-diagnostics':
          return resetAiNativeDiagnosticsSnapshot()

        case 'get-ai-config':
          return getAiConfig(services, modelAssignments)

        case 'set-model-assignment':
          await setModelAssignment({
            slot: action.slot,
            assignment: action.assignment,
          })
          return getAiConfig(services, modelAssignments)

        case 'clear-model-assignment':
          await clearAssignment(action.slot)
          await queryClient.invalidateQueries({
            queryKey: aiSettingsKeys.assignments(),
          })
          return getAiConfig(services, modelAssignments)

        case 'upsert-provider': {
          const provider = await upsertProvider(action.provider)
          return { provider, aiConfig: await getAiConfig(services, modelAssignments) }
        }

        case 'remove-provider':
          await removeProvider(action.id)
          return getAiConfig(services, modelAssignments)

        case 'set-provider-key':
          await setProviderKey({ id: action.id, secret: action.secret })
          return { id: action.id, hasKey: true }

        case 'test-provider':
          return testProvider(action.id)

        case 'set-brief':
          getStoreState().setBrief(action.text)
          return createAiNativeSnapshot(getStoreState())

        case 'set-param': {
          const value = validateParamValue(action.key, action.value)
          getStoreState().setParam(action.key, value)
          return { params: getStoreState().params }
        }

        case 'set-params':
          applyParams(action.params)
          return { params: getStoreState().params }

        case 'reset-params':
          getStoreState().resetParams()
          return { params: getStoreState().params }

        case 'import-board':
          await importBoard(action.path, action.name)
          return createAiNativeSnapshot(getStoreState())

        case 'import-mockup':
          await importMockup(action.path, action.name)
          return createAiNativeSnapshot(getStoreState())

        case 'run-cutout':
          if (!getStoreState().source.bitmap) {
            throw new Error('Import or generate a board before running cutout.')
          }
          analyze(action.withSlices ?? true)
          await waitForAnalysis(action.waitMs ?? 0)
          return createAiNativeSnapshot(getStoreState())

        case 'generate-mockup':
          await generateMockup()
          return createAiNativeSnapshot(getStoreState())

        case 'deconstruct-mockup':
          await deconstructMockup()
          return createAiNativeSnapshot(getStoreState())

        case 'compose-mockup':
          await composeMockup()
          return createAiNativeSnapshot(getStoreState())

        case 'plan-and-generate':
          await runPlan()
          return createAiNativeSnapshot(getStoreState())

        case 'plan-prototype': {
          const brief = semanticBrief(action.brief)
          const assignments = await readModelAssignments(modelAssignments)
          const chat = resolveModelForAction(
            action.providerId,
            action.model,
            assignments.chat,
            'chat',
          )
          const result = await planPrototype(services.generation, {
            providerId: chat.providerId,
            model: chat.model ?? action.model,
            brief,
            intent: getStoreState().intent ?? undefined,
          })
          if (isErr(result)) throw new Error(result.error)
          return { plan: result.data }
        }

        case 'plan-semantic-slices': {
          const brief = semanticBrief(action.brief)
          const assignments = await readModelAssignments(modelAssignments)
          const chat = resolveModelForAction(
            action.providerId,
            action.model,
            assignments.chat,
            'chat',
          )
          const reference = await resolveSemanticReference(action)
          const result = await planSemanticSlices(
            { generation: services.generation },
            {
              providerId: chat.providerId,
              model: chat.model,
              brief,
              sourceKind: action.sourceKind ?? reference.sourceKind,
              referenceImage: reference.bytes,
              maxSlices: action.maxSlices,
            },
          )
          if (isErr(result)) throw new Error(result.error)
          return {
            plan: result.data,
            reference,
          }
        }

        case 'run-semantic-slices': {
          const brief = semanticBrief(action.brief)
          const assignments = await readModelAssignments(modelAssignments)
          const chat = resolveModelForAction(
            action.providerId,
            action.model,
            assignments.chat,
            'chat',
          )
          const image = resolveModelForAction(
            action.imageProviderId,
            action.imageModel,
            assignments.image,
            'image',
          )
          const validation = resolveModelForAction(
            action.validationProviderId ?? chat.providerId,
            action.validationModel ?? chat.model,
            assignments.chat,
            'validation',
          )
          const reference = await resolveSemanticReference(action)
          const result = await runSemanticSliceExperiment(
            { generation: services.generation },
            {
              providerId: chat.providerId,
              model: chat.model,
              imageProviderId: image.providerId,
              imageModel: image.model,
              validationProviderId: validation.providerId,
              validationModel: validation.model,
              brief,
              sourceKind: action.sourceKind ?? reference.sourceKind,
              referenceImage: reference.bytes,
              referenceImages: reference.bytes ? [reference.bytes] : [],
              maxSlices: action.maxSlices,
              routes: action.routes,
              validate: action.validate,
            },
          )
          if (isErr(result)) throw new Error(result.error)
          return {
            plan: result.data.plan,
            summary: result.data.summary,
            reference,
            artifacts: await serializeSemanticArtifacts(
              result.data.artifacts,
              action.writeArtifacts !== false,
              action.artifactPrefix,
            ),
          }
        }

        case 'rerun-subtree':
          await reRunSubtree(action.nodeId)
          return createAiNativeSnapshot(getStoreState())

        case 'name-slices': {
          const count = await nameSlices()
          return { named: count, state: createAiNativeSnapshot(getStoreState()) }
        }

        case 'clear-graph':
          getStoreState().clearGraph()
          return createAiNativeSnapshot(getStoreState())

        case 'set-graph':
          getStoreState().setGraph(action.graph)
          return createAiNativeSnapshot(getStoreState())

        case 'reset-dag-nodes':
          getStoreState().resetDagNodes(new Set(action.ids))
          return createAiNativeSnapshot(getStoreState())

        case 'clear-intent':
          getStoreState().clearIntent()
          return createAiNativeSnapshot(getStoreState())

        case 'set-intent':
          getStoreState().setIntent(action.intent)
          return createAiNativeSnapshot(getStoreState())

        case 'set-design-md':
          getStoreState().setDesignMarkdown({
            name: action.name ?? 'DESIGN.md',
            content: action.content.trim(),
            importedAt: Date.now(),
          })
          return createAiNativeSnapshot(getStoreState())

        case 'import-design-md':
          await importDesignMarkdown(action.path, action.name)
          return createAiNativeSnapshot(getStoreState())

        case 'clear-design-md':
          getStoreState().clearDesignMarkdown()
          return createAiNativeSnapshot(getStoreState())

        case 'select-slice':
          getStoreState().selectSlice(action.id)
          return createAiNativeSnapshot(getStoreState())

        case 'rename-slice':
          getStoreState().renameSlice(action.id, action.name)
          return createAiNativeSnapshot(getStoreState())

        case 'clear-selection':
          getStoreState().clearSelection()
          return createAiNativeSnapshot(getStoreState())
      }
    },
    [
      analyze,
      composeMockup,
      deconstructMockup,
      generateMockup,
      nameSlices,
      modelAssignments,
      queryClient,
      reRunSubtree,
      removeProvider,
      runPlan,
      services,
      setModelAssignment,
      setProviderKey,
      testProvider,
      upsertProvider,
    ],
  )

  useEffect(() => {
    window.__CUTOUT_AI__ = {
      dispatch: execute,
      getState: () => createAiNativeSnapshot(getStoreState()),
    }
    return () => {
      if (window.__CUTOUT_AI__?.dispatch === execute) {
        delete window.__CUTOUT_AI__
      }
    }
  }, [execute])

  useEffect(() => {
    if (!isTauriRuntime()) return

    let stopped = false
    let timer: number | undefined

    const schedule = (): void => {
      if (!stopped) {
        timer = window.setTimeout(tick, POLL_INTERVAL_MS)
      }
    }

    const tick = async (): Promise<void> => {
      if (busyRef.current) {
        schedule()
        return
      }
      busyRef.current = true
      try {
        const commands = await invoke<AiNativeCommandEnvelope[]>('ai_native_poll', {
          limit: DEFAULT_QUEUE_LIMIT,
        })
        for (const command of commands) {
          await completeCommand(command, execute)
        }
      } catch (error) {
        console.warn('[AI Native] Poll failed:', errorMessage(error))
      } finally {
        busyRef.current = false
        schedule()
      }
    }

    void tick()
    return () => {
      stopped = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [execute])
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

async function getAiConfig(
  services: ServiceRegistry,
  modelAssignments: ModelAssignmentReader,
) {
  const providers = await services.providers.list()
  const statuses = await services.providers.statuses(providers.map((provider) => provider.id))
  const assignments =
    modelAssignments.data ?? (await modelAssignments.refetch()).data ?? {}

  return {
    assignments,
    providers: providers.map((provider) => ({
      ...provider,
      hasKey: statuses[provider.id] ?? false,
    })),
  }
}

async function readModelAssignments(
  modelAssignments: ModelAssignmentReader,
): Promise<ModelAssignments> {
  return modelAssignments.data ?? (await modelAssignments.refetch()).data ?? {}
}

function resolveModelForAction(
  providerId: string | undefined,
  model: string | undefined,
  fallback: ModelAssignments['chat'],
  label: string,
): ResolvedModel {
  if (providerId) {
    return { providerId, model }
  }
  if (fallback) {
    return { providerId: fallback.providerId, model: model ?? fallback.model }
  }
  throw new Error(`No ${label} model is configured.`)
}

function semanticBrief(override: string | undefined): string {
  const brief = (override ?? getStoreState().brief).trim()
  if (!brief) throw new Error('Write a brief before running semantic slices.')
  return brief
}

async function resolveSemanticReference(
  request: SemanticReferenceRequest,
): Promise<SemanticReferenceResult> {
  if (request.referencePath) {
    const { blob } = await readImageFile(request.referencePath, undefined)
    return {
      bytes: await blobToBytes(blob),
      sourceKind: request.sourceKind ?? 'mixed',
      source: 'file',
    }
  }

  const store = getStoreState()
  const mode = request.reference ?? 'auto'
  if (mode === 'none') {
    return { sourceKind: request.sourceKind ?? 'brief', source: 'none' }
  }

  if ((mode === 'mockup' || mode === 'auto') && store.mockup) {
    return {
      bytes: await blobToBytes(store.mockup.blob),
      sourceKind: request.sourceKind ?? 'mockup',
      source: 'mockup',
    }
  }

  if ((mode === 'board' || mode === 'auto') && store.source.bitmap) {
    return {
      bytes: await bitmapToBytes(store.source.bitmap),
      sourceKind: request.sourceKind ?? 'board',
      source: 'board',
    }
  }

  if (mode === 'mockup') throw new Error('No mockup is available as reference.')
  if (mode === 'board') throw new Error('No board is available as reference.')
  return { sourceKind: request.sourceKind ?? 'brief', source: 'none' }
}

async function serializeSemanticArtifacts(
  artifacts: readonly SemanticSliceArtifact[],
  writeArtifacts: boolean,
  artifactPrefix: string | undefined,
) {
  const serialized = []
  for (const artifact of artifacts) {
    serialized.push({
      spec: {
        id: artifact.spec.id,
        name: artifact.spec.name,
        role: artifact.spec.role,
        targetSize: artifact.spec.targetSize,
      },
      route: artifact.route,
      accepted: artifact.accepted,
      retryable: artifact.retryable,
      validation: artifact.validation,
      error: artifact.error,
      asset: artifact.asset
        ? await serializeGeneratedArtifact(artifact, writeArtifacts, artifactPrefix)
        : undefined,
    })
  }
  return serialized
}

async function serializeGeneratedArtifact(
  artifact: SemanticSliceArtifact,
  writeArtifact: boolean,
  artifactPrefix: string | undefined,
) {
  if (!artifact.asset) return undefined

  const blob = bytesToBlob(artifact.asset.bytes, artifact.asset.mediaType)
  const bitmap = await decodeImage(blob)
  const dimensions = { width: bitmap.width, height: bitmap.height }
  bitmap.close()

  const baseName = [
    artifactPrefix ?? 'semantic',
    artifact.spec.id,
    artifact.route,
  ].join('-')

  const written = writeArtifact
    ? await invoke<AiNativeWrittenArtifact>('ai_native_write_artifact', {
        name: `${baseName}.png`,
        bytes: Array.from(artifact.asset.bytes),
        mediaType: artifact.asset.mediaType,
      })
    : undefined

  return {
    ...dimensions,
    mediaType: artifact.asset.mediaType,
    byteLength: artifact.asset.bytes.byteLength,
    file: written,
  }
}

async function importBoard(path: string, nameOverride: string | undefined): Promise<void> {
  const { blob, name } = await readImageFile(path, nameOverride)
  const bitmap = await decodeImage(blob)
  getStoreState().loadImage({ bitmap, name: baseName(name) })
}

async function importMockup(path: string, nameOverride: string | undefined): Promise<void> {
  const { blob } = await readImageFile(path, nameOverride)
  const bitmap = await decodeImage(blob)
  getStoreState().setMockup({ bitmap, blob, width: bitmap.width, height: bitmap.height })
}

async function importDesignMarkdown(path: string, nameOverride: string | undefined): Promise<void> {
  const file = await invoke<AiNativeFilePayload>('ai_native_read_file', { path })
  const name = nameOverride ?? file.name
  if (!isDesignMarkdownFileName(name)) {
    throw new Error(`Unsupported DESIGN.md file: ${name}`)
  }
  const content = normalizedDesignMarkdown(
    new TextDecoder().decode(new Uint8Array(file.bytes)),
  )
  if (!content) throw new Error('DESIGN.md is empty.')
  getStoreState().setDesignMarkdown({
    name,
    content,
    importedAt: Date.now(),
  })
}

async function readImageFile(path: string, nameOverride: string | undefined) {
  const file = await invoke<AiNativeFilePayload>('ai_native_read_file', { path })
  const name = nameOverride ?? file.name
  const blob = bytesToBlob(new Uint8Array(file.bytes), file.mediaType)
  const probe = new File([blob], name, { type: file.mediaType })
  if (!isSupportedImage(probe)) {
    throw new Error(`Unsupported image file: ${name}`)
  }
  return { blob, name }
}

function applyParams(params: Partial<Record<ParamKey, number>>): void {
  const validated: Partial<Record<ParamKey, number>> = {}
  for (const key of PARAM_KEYS) {
    const value = params[key]
    if (value !== undefined) {
      validated[key] = validateParamValue(key, value)
    }
  }
  for (const key of PARAM_KEYS) {
    const value = validated[key]
    if (value !== undefined) {
      getStoreState().setParam(key, value)
    }
  }
}

async function completeCommand(
  command: AiNativeCommandEnvelope,
  execute: (action: unknown) => Promise<unknown>,
): Promise<void> {
  const result: AiNativeCommandResult = await execute(command.action)
    .then((data) => ({ ok: true, data }))
    .catch((error: unknown) => ({ ok: false, error: errorMessage(error) }))

  try {
    await invoke('ai_native_complete', { id: command.id, result })
  } catch (error) {
    console.error('[AI Native] Could not write command result:', errorMessage(error))
  }
}

async function waitForAnalysis(waitMs: number): Promise<void> {
  const timeoutMs = Math.max(0, waitMs)
  if (timeoutMs === 0) return

  const current = getStoreState().analysis
  if (current.status === 'done') return
  if (current.status === 'error') {
    throw new Error(current.error ?? 'Analysis failed.')
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false
    let timer: number | undefined
    let unsubscribe = (): void => {}
    const cleanup = (): void => {
      if (timer !== undefined) window.clearTimeout(timer)
      unsubscribe()
    }
    const settle = (callback: () => void): void => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }
    unsubscribe = useStore.subscribe((state) => {
      if (state.analysis.status === 'done') {
        settle(resolve)
      } else if (state.analysis.status === 'error') {
        settle(() => reject(new Error(state.analysis.error ?? 'Analysis failed.')))
      }
    })
    timer = window.setTimeout(() => {
      settle(() => reject(new Error(`Analysis did not finish within ${timeoutMs}ms.`)))
    }, timeoutMs)
  })
}

function errorMessage(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
        return `${path}${issue.message}`
      })
      .join('; ')
  }
  if (error instanceof Error) return error.message
  return String(error)
}
