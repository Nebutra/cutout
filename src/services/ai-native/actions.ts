/**
 * AI Native action contract.
 *
 * This file intentionally stays UI-free: it validates external JSON commands
 * and turns the live Zustand state into a serializable snapshot that Codex,
 * Claude Code, or a CLI can inspect without touching browser-only objects.
 */
import { z } from 'zod'
import { PARAM_RANGE_BY_KEY } from '@/lib/constants'
import { graphSpecSchema } from '@/dag/graph-spec'
import { intentProfileSchema } from '@/dag/intent-types'
import { modelAssignmentSchema } from '@/services/ai/model-assignment-types'
import { providerConfigSchema } from '@/services/ai/provider-types'
import type { DagNodeOutput, ParamKey, Store } from '@/store/types'
import {
  clearAiNativeDiagnostics,
  getAiNativeDiagnostics,
} from './diagnostics'

export const PARAM_KEYS = ['threshold', 'minArea', 'mergeGap', 'padding'] as const

const paramKeySchema = z.enum(PARAM_KEYS)
const slotIdSchema = z.enum(['chat', 'image'])
const semanticSliceRouteSchema = z.enum(['text-to-image', 'image-to-image'])
const semanticSliceReferenceSchema = z.enum(['auto', 'none', 'mockup', 'board'])
const providerDraftSchema = providerConfigSchema.extend({
  id: z.string().min(1).optional(),
})

const paramsPatchSchema = z
  .object({
    threshold: z.number().optional(),
    minArea: z.number().optional(),
    mergeGap: z.number().optional(),
    padding: z.number().optional(),
  })
  .strict()

export const aiNativeActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ping') }),
  z.object({ type: z.literal('get-state') }),
  z.object({ type: z.literal('snapshot') }),
  z.object({ type: z.literal('get-diagnostics') }),
  z.object({ type: z.literal('clear-diagnostics') }),
  z.object({ type: z.literal('get-ai-config') }),
  z.object({
    type: z.literal('set-model-assignment'),
    slot: slotIdSchema,
    assignment: modelAssignmentSchema,
  }),
  z.object({ type: z.literal('clear-model-assignment'), slot: slotIdSchema }),
  z.object({ type: z.literal('upsert-provider'), provider: providerDraftSchema }),
  z.object({ type: z.literal('remove-provider'), id: z.string().min(1) }),
  z.object({
    type: z.literal('set-provider-key'),
    id: z.string().min(1),
    secret: z.string().min(1),
  }),
  z.object({ type: z.literal('test-provider'), id: z.string().min(1) }),
  z.object({ type: z.literal('set-brief'), text: z.string() }),
  z.object({
    type: z.literal('set-param'),
    key: paramKeySchema,
    value: z.number(),
  }),
  z.object({ type: z.literal('set-params'), params: paramsPatchSchema }),
  z.object({ type: z.literal('reset-params') }),
  z.object({
    type: z.literal('import-board'),
    path: z.string().min(1),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal('import-mockup'),
    path: z.string().min(1),
    name: z.string().optional(),
  }),
  z.object({
    type: z.literal('run-cutout'),
    withSlices: z.boolean().optional(),
    waitMs: z.number().optional(),
  }),
  z.object({ type: z.literal('generate-mockup') }),
  z.object({ type: z.literal('deconstruct-mockup') }),
  z.object({ type: z.literal('compose-mockup') }),
  z.object({ type: z.literal('plan-and-generate') }),
  z.object({
    type: z.literal('plan-prototype'),
    brief: z.string().optional(),
    providerId: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal('plan-semantic-slices'),
    brief: z.string().optional(),
    providerId: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    sourceKind: z.enum(['brief', 'mockup', 'board', 'mixed']).optional(),
    reference: semanticSliceReferenceSchema.optional(),
    referencePath: z.string().min(1).optional(),
    maxSlices: z.number().int().positive().max(100).optional(),
  }),
  z.object({
    type: z.literal('run-semantic-slices'),
    brief: z.string().optional(),
    providerId: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    sourceKind: z.enum(['brief', 'mockup', 'board', 'mixed']).optional(),
    reference: semanticSliceReferenceSchema.optional(),
    referencePath: z.string().min(1).optional(),
    maxSlices: z.number().int().positive().max(100).optional(),
    imageProviderId: z.string().min(1).optional(),
    imageModel: z.string().min(1).optional(),
    validationProviderId: z.string().min(1).optional(),
    validationModel: z.string().min(1).optional(),
    routes: z.array(semanticSliceRouteSchema).optional(),
    validate: z.boolean().optional(),
    writeArtifacts: z.boolean().optional(),
    artifactPrefix: z.string().min(1).optional(),
  }),
  z.object({ type: z.literal('rerun-subtree'), nodeId: z.string().min(1) }),
  z.object({ type: z.literal('name-slices') }),
  z.object({ type: z.literal('clear-graph') }),
  z.object({ type: z.literal('set-graph'), graph: graphSpecSchema }),
  z.object({ type: z.literal('reset-dag-nodes'), ids: z.array(z.string().min(1)) }),
  z.object({ type: z.literal('clear-intent') }),
  z.object({ type: z.literal('set-intent'), intent: intentProfileSchema }),
  z.object({
    type: z.literal('set-design-md'),
    name: z.string().min(1).optional(),
    content: z.string().min(1),
  }),
  z.object({
    type: z.literal('import-design-md'),
    path: z.string().min(1),
    name: z.string().min(1).optional(),
  }),
  z.object({ type: z.literal('clear-design-md') }),
  z.object({ type: z.literal('select-slice'), id: z.string().min(1) }),
  z.object({ type: z.literal('rename-slice'), id: z.string().min(1), name: z.string() }),
  z.object({ type: z.literal('clear-selection') }),
])

export type AiNativeAction = z.infer<typeof aiNativeActionSchema>

export interface AiNativeCommandEnvelope {
  readonly id: string
  readonly action: unknown
}

export interface AiNativeCommandResult {
  readonly ok: boolean
  readonly data?: unknown
  readonly error?: string
}

export function parseAiNativeAction(action: unknown): AiNativeAction {
  return aiNativeActionSchema.parse(action)
}

export function validateParamValue(key: ParamKey, value: number): number {
  const range = PARAM_RANGE_BY_KEY[key]
  if (!Number.isFinite(value)) {
    throw new Error(`${key} must be a finite number.`)
  }
  if (value < range.min || value > range.max) {
    throw new Error(`${key} must be between ${range.min} and ${range.max}.`)
  }
  return value
}

export function createAiNativeSnapshot(store: Store) {
  const slices = store.analysis.slices.map((slice) => ({
    id: slice.id,
    index: slice.index,
    name: slice.name,
    box: slice.box,
    width: slice.width,
    height: slice.height,
    selected: slice.selected,
    blobSize: slice.blob.size,
    blobType: slice.blob.type || null,
  }))

  return {
    brief: store.brief,
    intent: store.intent,
    params: store.params,
    source: {
      present: Boolean(store.source.bitmap),
      name: store.source.name,
      width: store.source.width,
      height: store.source.height,
      imageId: store.source.imageId,
    },
    mockup: store.mockup
      ? {
          present: true,
          width: store.mockup.width,
          height: store.mockup.height,
          blobSize: store.mockup.blob.size,
          blobType: store.mockup.blob.type || null,
        }
      : { present: false },
    designMarkdown: store.designMarkdown
      ? {
          present: true,
          name: store.designMarkdown.name,
          byteLength: new TextEncoder().encode(store.designMarkdown.content).byteLength,
          importedAt: store.designMarkdown.importedAt,
        }
      : { present: false },
    analysis: {
      status: store.analysis.status,
      runId: store.analysis.runId,
      error: store.analysis.error,
      hasPreview: Boolean(store.analysis.previewBitmap),
      sliceCount: slices.length,
      selectedSliceId: slices.find((slice) => slice.selected)?.id ?? null,
      slices,
    },
    pipeline: {
      graph: store.pipeline,
      genPhase: store.genPhase,
      genError: store.genError,
    },
    plannedGraph: store.graph,
    diagnostics: getAiNativeDiagnostics(),
    dagNodes: Object.fromEntries(
      Object.entries(store.dagNodes).map(([id, state]) => [
        id,
        {
          status: state.status,
          error: state.error,
          output: summarizeDagOutput(state.output),
        },
      ]),
    ),
  }
}

export function createAiNativeDiagnosticsSnapshot() {
  return {
    diagnostics: getAiNativeDiagnostics(),
  }
}

export function resetAiNativeDiagnosticsSnapshot() {
  clearAiNativeDiagnostics()
  return createAiNativeDiagnosticsSnapshot()
}

function summarizeDagOutput(output: DagNodeOutput | undefined) {
  if (!output) return undefined

  switch (output.kind) {
    case 'image':
      return {
        kind: output.kind,
        mediaType: output.mediaType,
        byteLength: output.bytes.byteLength,
      }
    case 'slices':
      return {
        kind: output.kind,
        sliceCount: output.slices.length,
        boardByteLength: output.boardBytes.byteLength,
        slices: output.slices.map((slice) => ({
          id: slice.id,
          index: slice.index,
          box: slice.box,
          width: slice.width,
          height: slice.height,
        })),
      }
    case 'names':
      return {
        kind: output.kind,
        names: output.names,
      }
  }
}
