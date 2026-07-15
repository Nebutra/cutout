import { z } from 'zod'
import { brandKitInputSchema } from '@/brand-kit'
import { codingTaskSchema } from '@/coding-runtime/contracts'
import { paidToolRequestSchema } from './paid-tool-contract'

/**
 * The intentionally small, transport-neutral control surface for coding agents.
 *
 * This is a protocol boundary, not a bridge to the UI store. A host may map
 * accepted operations to domain services, but this module never reads files,
 * provider configuration, or credentials and never invokes a provider.
 */
export const CONTROL_PROTOCOL_VERSION = 'cutout.control.v1' as const

const SECRET_VALUE_PATTERN = /(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+\b)/i
const safeControlTextSchema = z.string().refine(
  (value) => !SECRET_VALUE_PATTERN.test(value),
  'Credential-shaped values are not accepted by the control protocol.',
)
const opaqueControlIdSchema = safeControlTextSchema.min(1).max(160)

const relativeScanPathSchema = safeControlTextSchema
  .min(1)
  .max(500)
  .refine((value) => {
    if (value === '.') return true
    if (value.includes('\0') || value.startsWith('/') || value.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(value)) return false
    return value.replaceAll('\\', '/').split('/').every((part) => part.length > 0 && part !== '.' && part !== '..')
  }, 'Expected a controlled relative path.')
  .refine((value) => !/(^|\/)(?:\.env(?:\.|$)|[^/]*(?:secret|credential|api[-_]?key|private[-_]?key|token)[^/]*)(?:\/|$)/i.test(value), 'Credential-shaped paths are not accepted.')

const sourceRoleSchema = z.enum([
  'requirement', 'reference', 'constraint', 'implementation', 'brand-asset', 'evidence',
])

const sourceLicenseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('spdx'), identifier: safeControlTextSchema.min(1).max(200) }).strict(),
  z.object({ kind: z.literal('proprietary'), holder: safeControlTextSchema.min(1).max(200) }).strict(),
  z.object({ kind: z.literal('public-domain') }).strict(),
  z.object({ kind: z.literal('unknown'), rationale: safeControlTextSchema.min(1).max(1_000) }).strict(),
])

const sourceCommonSchema = z.object({
  role: sourceRoleSchema,
  license: sourceLicenseSchema,
  promptProvenance: safeControlTextSchema.min(1).max(20_000).optional(),
}).strict()

/** Descriptors only. The host resolves scans below its controlled project root. */
const sourceIngestOperationSchema = z.object({
  type: z.literal('source.ingest'),
  input: z.discriminatedUnion('type', [
    sourceCommonSchema.extend({
      type: z.literal('inline-text'),
      sourceKind: z.enum(['need', 'story', 'idea', 'document', 'code']),
      title: safeControlTextSchema.min(1).max(200),
      text: safeControlTextSchema.min(1).max(1_000_000),
    }).strict(),
    sourceCommonSchema.extend({
      type: z.literal('url-descriptor'),
      url: safeControlTextSchema.min(1).max(4_000).refine((value) => {
        try {
          const url = new URL(value)
          const credentialParameter = [...url.searchParams.keys()].some((key) => /(?:api[-_]?key|secret|token|password|authorization)/i.test(key))
          return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password && !credentialParameter
        } catch { return false }
      }, 'Expected a credential-free HTTP(S) URL.'),
      title: safeControlTextSchema.min(1).max(200).optional(),
      capturedMediaType: safeControlTextSchema.min(1).max(200).optional(),
    }).strict(),
    sourceCommonSchema.extend({
      type: z.literal('local-file-scan'),
      path: relativeScanPathSchema.refine((value) => value !== '.', 'Expected a file path, not the project root.'),
      sourceKind: z.enum(['document', 'code', 'screenshot', 'photo', 'video']),
      title: safeControlTextSchema.min(1).max(200).optional(),
      mediaType: safeControlTextSchema.min(1).max(200).optional(),
    }).strict(),
    sourceCommonSchema.extend({
      type: z.literal('repository-scan'),
      root: relativeScanPathSchema.default('.'),
      label: safeControlTextSchema.min(1).max(200).optional(),
    }).strict(),
  ]),
}).strict()

const materialKindSchema = z.enum([
  'design-system',
  'prototype-page',
  'cutout-slice',
  'design-markdown',
])

const approvalSchema = z.object({
  id: opaqueControlIdSchema,
  grantedAt: z.number().int().nonnegative(),
}).strict()

const projectContextOperationSchema = z.object({
  type: z.literal('project.context'),
  include: z.array(z.enum(['summary', 'outcome', 'run-events'])).max(3).optional(),
}).strict()

const designPatchOperationSchema = z.object({
  type: z.literal('design.patch'),
  patches: z.array(z.object({
    op: z.enum(['replace', 'append']),
    // Design source is deliberately the only editable document in v1.
    path: z.enum(['/designMarkdown', '/project/name']),
    value: safeControlTextSchema.min(1).max(200_000),
  }).strict()).min(1).max(100),
}).strict()

const tokensPatchOperationSchema = z.object({
  type: z.literal('tokens.patch'),
  changes: z.array(z.object({
    token: z.string().regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/),
    value: z.union([safeControlTextSchema.min(1).max(4_000), z.number().finite()]),
  }).strict()).min(1).max(200),
}).strict()

const materialListOperationSchema = z.object({
  type: z.literal('material.list'),
  filter: z.object({
    kind: materialKindSchema.optional(),
    pageId: opaqueControlIdSchema.optional(),
  }).strict().optional(),
}).strict()

const runStartOperationSchema = z.object({
  type: z.literal('run.start'),
  runId: opaqueControlIdSchema,
  mode: z.enum(['create', 'repair']),
  intent: safeControlTextSchema.min(1).max(20_000),
}).strict()

const runGetOperationSchema = z.object({
  type: z.literal('run.get'),
  runId: opaqueControlIdSchema,
}).strict()

const runCancelOperationSchema = z.object({
  type: z.literal('run.cancel'),
  runId: opaqueControlIdSchema,
  reason: safeControlTextSchema.min(1).max(1_000).optional(),
}).strict()

const runEventsOperationSchema = z.object({
  type: z.literal('run.events'),
  runId: opaqueControlIdSchema,
  afterEventId: opaqueControlIdSchema.optional(),
  limit: z.number().int().min(1).max(1_000).optional(),
}).strict()

const validateOperationSchema = z.object({
  type: z.literal('validate'),
  scope: z.array(z.enum(['design', 'tokens', 'materials', 'outcome'])).min(1).max(4),
}).strict()

const exportDesignKitOperationSchema = z.object({
  type: z.literal('export.design-kit'),
  format: z.enum(['directory', 'json', 'css']),
  include: z.array(z.enum(['design-markdown', 'tokens', 'assets'])).min(1).max(3).optional(),
}).strict()

/**
 * Brand facts are intentionally part of the request, rather than being
 * inferred from a project name, pixels, or a model response. The runtime
 * additionally proves that input.document is byte-equivalent to the current
 * project DesignDocument before it writes anything.
 */
const exportBrandKitOperationSchema = z.object({
  type: z.literal('export.brand-kit'),
  input: brandKitInputSchema,
}).strict()

/**
 * The host compiles the StarterPlan from its verified Design IR. A caller may
 * select a published framework, but never supplies an output directory,
 * source files, shell command, package manager option, or arbitrary plan.
 */
const exportStarterOperationSchema = z.object({
  type: z.literal('export.starter'),
  framework: z.enum(['next-app-router', 'vite-react', 'nuxt', 'tanstack-start']),
}).strict()

const paidToolInvokeOperationSchema = z.object({
  type: z.literal('tool.invoke'),
  tool: paidToolRequestSchema,
}).strict()

const codingOperation = <T extends 'execute' | 'review' | 'repair'>(kind: T) => z.object({
  type: z.literal(`coding.${kind}`), task: codingTaskSchema,
}).strict().superRefine((operation, context) => {
  if (operation.task.kind !== kind) context.addIssue({ code: 'custom', path: ['task', 'kind'], message: `Expected task kind "${kind}".` })
})

export const controlOperationSchema = z.discriminatedUnion('type', [
  projectContextOperationSchema,
  designPatchOperationSchema,
  tokensPatchOperationSchema,
  sourceIngestOperationSchema,
  materialListOperationSchema,
  runStartOperationSchema,
  runGetOperationSchema,
  runCancelOperationSchema,
  runEventsOperationSchema,
  validateOperationSchema,
  exportDesignKitOperationSchema,
  exportBrandKitOperationSchema,
  exportStarterOperationSchema,
  codingOperation('execute'),
  codingOperation('review'),
  codingOperation('repair'),
  paidToolInvokeOperationSchema,
])

export const controlRequestSchema = z.object({
  protocol: z.literal(CONTROL_PROTOCOL_VERSION),
  requestId: opaqueControlIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  mode: z.enum(['dry-run', 'apply']),
  approval: approvalSchema.optional(),
  operation: controlOperationSchema,
}).strict()

export type ControlOperation = z.infer<typeof controlOperationSchema>
export type ControlRequest = z.infer<typeof controlRequestSchema>
export type SourceIngestOperation = Extract<ControlOperation, { readonly type: 'source.ingest' }>

export type ControlResponseStatus = 'ok' | 'conflict' | 'denied' | 'invalid'

const controlResponseErrorSchema = z.object({
  code: z.enum([
    'revision-conflict',
    'policy-denied',
    'approval-required',
    'invalid-request',
    'authorization-required',
    'capability-required',
    'budget-exceeded',
  ]),
  message: z.string().min(1).max(4_000),
}).strict()

/** Schema for a serializable control response. `result` is host-owned data and
 * must be passed through `redactControlValue` before it enters this envelope. */
export const controlResponseSchema = z.object({
  protocol: z.literal(CONTROL_PROTOCOL_VERSION),
  requestId: opaqueControlIdSchema,
  status: z.enum(['ok', 'conflict', 'denied', 'invalid']),
  revision: z.number().int().nonnegative(),
  dryRun: z.boolean(),
  idempotent: z.boolean(),
  result: z.unknown().optional(),
  error: controlResponseErrorSchema.optional(),
}).strict()

export interface ControlResponse {
  readonly protocol: typeof CONTROL_PROTOCOL_VERSION
  readonly requestId: string
  readonly status: ControlResponseStatus
  readonly revision: number
  readonly dryRun: boolean
  readonly idempotent: boolean
  readonly result?: unknown
  readonly error?: {
    readonly code:
      | 'revision-conflict'
      | 'policy-denied'
      | 'approval-required'
      | 'invalid-request'
      | 'authorization-required'
      | 'capability-required'
      | 'budget-exceeded'
    readonly message: string
  }
}

export interface ControlLedger {
  readonly revision: number
  /** Completed response by opaque request ID. No request body or secrets persist. */
  readonly completed: Readonly<Record<string, ControlResponse>>
}

export function createControlLedger(revision = 0): ControlLedger {
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error('Control revision must be a non-negative integer.')
  }
  return { revision, completed: {} }
}

export interface ControlEffects {
  readonly paid: boolean
  readonly external: boolean
}

export interface ControlPolicy {
  readonly allowPaid: boolean
  readonly allowExternal: boolean
  readonly requireApprovalForPaid?: boolean
  readonly requireApprovalForExternal?: boolean
}

export interface ControlActionGuardOptions {
  readonly effects: ControlEffects
  readonly policy: ControlPolicy
}

export interface ControlActionGuardResult {
  readonly allowed: boolean
  readonly reason?: 'paid-actions-disabled' | 'external-actions-disabled' | 'approval-required'
}

/**
 * Guard a host-declared side effect. The agent cannot make an action paid or
 * external merely by adding fields to JSON: the host owns this declaration.
 */
export function guardControlAction(
  request: Pick<ControlRequest, 'approval'>,
  options: ControlActionGuardOptions,
): ControlActionGuardResult {
  const { effects, policy } = options
  if (effects.paid && !policy.allowPaid) {
    return { allowed: false, reason: 'paid-actions-disabled' }
  }
  if (effects.external && !policy.allowExternal) {
    return { allowed: false, reason: 'external-actions-disabled' }
  }
  if (
    (effects.paid && policy.requireApprovalForPaid)
    || (effects.external && policy.requireApprovalForExternal)
  ) {
    if (!request.approval) return { allowed: false, reason: 'approval-required' }
  }
  return { allowed: true }
}

export interface ApplyControlRequestOptions {
  /** Hosts may raise the effect classification, never lower it. */
  readonly effects?: ControlEffects
  readonly policy?: ControlPolicy
}

export type ControlRequestDecision = 'dispatch' | 'dry-run' | 'duplicate' | 'conflict' | 'denied'

export interface ControlRequestPreparation {
  readonly decision: ControlRequestDecision
  readonly ledger: ControlLedger
  readonly response: ControlResponse
  /** Records a safe, idempotent result after the host has completed dispatch. */
  readonly complete: (result: unknown, nextRevision: number) => {
    readonly ledger: ControlLedger
    readonly response: ControlResponse
  }
}

/**
 * Pure pre-dispatch gate for a parsed request. It handles optimistic revision
 * checks, replay protection and conservative effect policy. A host dispatches
 * only when `decision === 'dispatch'`; dry runs never enter the ledger.
 */
export function applyControlRequest(
  ledger: ControlLedger,
  request: ControlRequest,
  options: ApplyControlRequestOptions = {},
): ControlRequestPreparation {
  const previous = ledger.completed[request.requestId]
  if (previous) {
    return preparation('duplicate', ledger, {
      ...previous,
      idempotent: true,
    })
  }

  if (request.expectedRevision !== ledger.revision) {
    return preparation('conflict', ledger, response(request, ledger.revision, 'conflict', {
      code: 'revision-conflict',
      message: `Expected revision ${request.expectedRevision}, current revision is ${ledger.revision}.`,
    }))
  }

  const effects = mergeEffects(defaultEffectsFor(request.operation), options.effects)
  // Dry-runs are pure descriptions. They must stay available even when the
  // matching apply operation is disabled or needs approval, otherwise an
  // agent cannot present a complete impact/file plan to a human first.
  if (request.mode === 'dry-run') {
    return preparation('dry-run', ledger, {
      ...response(request, ledger.revision, 'ok'),
      dryRun: true,
      result: { operation: request.operation.type, effects },
    })
  }

  const guard = guardControlAction(request, {
    effects,
    policy: options.policy ?? defaultControlPolicy(),
  })
  if (!guard.allowed) {
    const requiresApproval = guard.reason === 'approval-required'
    return preparation('denied', ledger, response(request, ledger.revision, 'denied', {
      code: requiresApproval ? 'approval-required' : 'policy-denied',
      message: requiresApproval
        ? 'This action requires explicit approval.'
        : 'This action is not allowed by the current control policy.',
    }))
  }

  return preparation('dispatch', ledger, response(request, ledger.revision, 'ok'))
}

function preparation(
  decision: ControlRequestDecision,
  ledger: ControlLedger,
  controlResponse: ControlResponse,
): ControlRequestPreparation {
  return {
    decision,
    ledger,
    response: controlResponse,
    complete(result: unknown, nextRevision: number) {
      if (decision !== 'dispatch') {
        throw new Error(`Cannot complete a ${decision} control request.`)
      }
      if (!Number.isInteger(nextRevision) || nextRevision < ledger.revision) {
        throw new Error('Completed control request must not decrease the revision.')
      }
      const safeResponse: ControlResponse = {
        ...controlResponse,
        revision: nextRevision,
        result: redactControlValue(result),
      }
      return {
        ledger: {
          revision: nextRevision,
          completed: { ...ledger.completed, [controlResponse.requestId]: safeResponse },
        },
        response: safeResponse,
      }
    },
  }
}

function response(
  request: ControlRequest,
  revision: number,
  status: ControlResponseStatus,
  error?: ControlResponse['error'],
): ControlResponse {
  return {
    protocol: CONTROL_PROTOCOL_VERSION,
    requestId: request.requestId,
    status,
    revision,
    dryRun: false,
    idempotent: false,
    ...(error ? { error } : {}),
  }
}

function defaultEffectsFor(operation: ControlOperation): ControlEffects {
  // Export is intentionally considered an external write, even if a given host
  // later implements it as a local download. Hosts can require an approval.
  return {
    paid: operation.type === 'tool.invoke',
    external: operation.type === 'source.ingest' || operation.type === 'export.design-kit' || operation.type === 'export.brand-kit' || operation.type === 'export.starter',
  }
}

function mergeEffects(base: ControlEffects, override: ControlEffects | undefined): ControlEffects {
  return {
    paid: base.paid || Boolean(override?.paid),
    external: base.external || Boolean(override?.external),
  }
}

function defaultControlPolicy(): ControlPolicy {
  return {
    allowPaid: false,
    allowExternal: false,
  }
}

const SECRET_KEY = /(?:^|[_-])(api[_-]?key|secret|password|authorization|provider[_-]?key|access[_-]?token|refresh[_-]?token)(?:$|[_-])/i
const SECRET_VALUE = /(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+\b)/gi

/**
 * Safe final boundary before caching or returning host results. Design tokens
 * are ordinary domain data; only credential-shaped keys and values are hidden.
 */
export function redactControlValue(value: unknown): unknown {
  return redact(value, new WeakSet<object>())
}

function redact(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return value.replace(SECRET_VALUE, '[REDACTED]')
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, seen))
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return '[CIRCULAR]'
  seen.add(value)
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key,
    SECRET_KEY.test(key) ? '[REDACTED]' : redact(nested, seen),
  ]))
}
