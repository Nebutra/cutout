import { z } from 'zod'

const id = z.string().min(1).max(240)
const sha256 = z.string().regex(/^[a-f0-9]{64}$/)
const timestamp = z.number().int().nonnegative()

export const assetProductionRouteSchema = z.enum([
  'board-cutout',
  'direct-generate',
  'semantic-repair',
  'import-cutout',
])
export type AssetProductionRoute = z.infer<typeof assetProductionRouteSchema>

export const productionArtifactRefSchema = z.object({
  artifactId: id,
  sha256,
  mediaType: z.string().min(1).max(120),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
}).strict()
export type ProductionArtifactRef = z.infer<typeof productionArtifactRefSchema>

export const sourceRevisionSchema = z.object({
  projectRevisionId: id,
  designSystemArtifactId: id.optional(),
  pageArtifacts: z.array(z.object({
    pageId: id,
    artifactId: id,
    sha256,
  }).strict()),
}).strict()
export type SourceRevision = z.infer<typeof sourceRevisionSchema>

export const assetProductionTaskSchema = z.object({
  taskId: id,
  manifestItemId: id,
  pageId: id,
  regionId: id,
  route: assetProductionRouteSchema,
  required: z.boolean(),
  output: z.object({
    mediaType: z.literal('image/png'),
    subjectCount: z.literal(1),
    transparent: z.boolean(),
  }).strict(),
  boardGroupId: id.optional(),
  label: z.string().min(1).max(240).optional(),
  description: z.string().min(1).max(2_000).optional(),
}).strict()
export type AssetProductionTask = z.infer<typeof assetProductionTaskSchema>

export const boardLayoutManifestSchema = z.object({
  version: z.literal('asset-board-layout.v1'),
  boardGroupId: id,
  taskIds: z.array(id).min(1),
  slots: z.array(z.object({
    taskId: id,
    normalizedBounds: z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().positive().max(1),
      height: z.number().positive().max(1),
    }).strict(),
  }).strict()).min(1),
}).strict().superRefine((manifest, context) => {
  const taskIds = new Set(manifest.taskIds)
  const slotIds = manifest.slots.map((slot) => slot.taskId)
  if (taskIds.size !== manifest.taskIds.length) {
    context.addIssue({ code: 'custom', message: 'Board task ids must be unique.' })
  }
  if (new Set(slotIds).size !== slotIds.length) {
    context.addIssue({ code: 'custom', message: 'Board slot task ids must be unique.' })
  }
  if (slotIds.length !== manifest.taskIds.length || slotIds.some((taskId) => !taskIds.has(taskId))) {
    context.addIssue({ code: 'custom', message: 'Board slots must cover every board task exactly once.' })
  }
  for (const slot of manifest.slots) {
    if (slot.normalizedBounds.x + slot.normalizedBounds.width > 1
      || slot.normalizedBounds.y + slot.normalizedBounds.height > 1) {
      context.addIssue({ code: 'custom', message: `Board slot ${slot.taskId} exceeds normalized bounds.` })
    }
  }
})
export type BoardLayoutManifest = z.infer<typeof boardLayoutManifestSchema>

export const assetProductionPlanSchema = z.object({
  version: z.literal('asset-production-plan.v1'),
  planId: id,
  planHash: sha256,
  sourceRevision: sourceRevisionSchema,
  tasks: z.array(assetProductionTaskSchema),
  boardLayouts: z.array(boardLayoutManifestSchema),
  ignoredManifestItemIds: z.array(id),
  createdAt: timestamp,
}).strict().superRefine((plan, context) => {
  const taskIds = plan.tasks.map((task) => task.taskId)
  const manifestIds = plan.tasks.map((task) => task.manifestItemId)
  if (new Set(taskIds).size !== taskIds.length) {
    context.addIssue({ code: 'custom', message: 'Asset production task ids must be unique.' })
  }
  if (new Set(manifestIds).size !== manifestIds.length) {
    context.addIssue({ code: 'custom', message: 'Manifest items must map to one production task.' })
  }
  const boardTaskIds = new Set(plan.boardLayouts.flatMap((layout) => layout.taskIds))
  for (const task of plan.tasks) {
    if (task.route === 'board-cutout' && (!task.boardGroupId || !boardTaskIds.has(task.taskId))) {
      context.addIssue({ code: 'custom', message: `Board task ${task.taskId} has no board layout.` })
    }
    if (task.route !== 'board-cutout' && task.boardGroupId) {
      context.addIssue({ code: 'custom', message: `Non-board task ${task.taskId} cannot declare a board group.` })
    }
  }
})
export type AssetProductionPlan = z.infer<typeof assetProductionPlanSchema>

export const productionIssueSchema = z.object({
  code: z.string().min(1).max(120),
  kind: z.enum(['integrity', 'quality', 'warning']),
  message: z.string().min(1).max(2_000),
  waivable: z.boolean(),
  source: z.enum(['runtime', 'deterministic-check', 'model-review', 'user']),
  recordedAt: timestamp,
}).strict().superRefine((issue, context) => {
  if (issue.kind === 'integrity' && issue.waivable) {
    context.addIssue({ code: 'custom', message: 'Integrity issues cannot be waivable.' })
  }
})
export type ProductionIssue = z.infer<typeof productionIssueSchema>

export const productionTaskEvidenceSchema = z.object({
  sourceArtifactId: id.optional(),
  maskArtifactId: id.optional(),
  bounds: z.object({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  }).strict().optional(),
  cutoutParams: z.object({
    threshold: z.number(),
    minArea: z.number(),
    mergeGap: z.number(),
    padding: z.number(),
  }).strict().optional(),
  boardDiagnostics: z.object({
    borderWhiteRatio: z.number().min(0).max(1),
    whiteRatio: z.number().min(0).max(1),
    compliant: z.boolean(),
  }).strict().optional(),
  qaVerdict: z.object({
    pass: z.boolean(),
    failures: z.array(z.string().min(1).max(2_000)),
    unavailable: z.boolean().optional(),
  }).strict().optional(),
  providerRoute: z.string().min(1).max(240).optional(),
  lineage: z.object({
    previousRunId: id,
    previousTaskId: id,
    previousArtifactSha256: sha256,
  }).strict().optional(),
}).strict()
export type ProductionTaskEvidence = z.infer<typeof productionTaskEvidenceSchema>

export const productionDecisionReceiptSchema = z.object({
  version: z.literal('asset-production-decision.v1'),
  receiptId: id,
  taskId: id,
  artifactSha256: sha256,
  projectRevisionId: id,
  decision: z.enum(['approve', 'waive']),
  issueCodes: z.array(z.string().min(1)).min(1),
  actor: z.object({ kind: z.enum(['human', 'agent']), id }).strict(),
  decidedAt: timestamp,
}).strict()
export type ProductionDecisionReceipt = z.infer<typeof productionDecisionReceiptSchema>

export const productionTaskStatusSchema = z.enum([
  'queued',
  'generating',
  'candidate-ready',
  'reviewing',
  'accepted',
  'cutting',
  'verifying',
  'ready',
  'needs-review',
  'waived',
  'failed',
  'cancelled',
  'legacy-ready',
])
export type ProductionTaskStatus = z.infer<typeof productionTaskStatusSchema>

export const productionTaskStateSchema = z.object({
  taskId: id,
  status: productionTaskStatusSchema,
  attempt: z.number().int().nonnegative(),
  candidate: productionArtifactRefSchema.optional(),
  output: productionArtifactRefSchema.optional(),
  issues: z.array(productionIssueSchema),
  decision: productionDecisionReceiptSchema.optional(),
  evidence: productionTaskEvidenceSchema.optional(),
  origin: z.enum(['native', 'legacy-imported']),
  updatedAt: timestamp,
}).strict()
export type ProductionTaskState = z.infer<typeof productionTaskStateSchema>

export const productionRunStatusSchema = z.enum([
  'planned',
  'running',
  'partial',
  'needs-review',
  'completed',
  'failed',
  'cancelled',
])
export type ProductionRunStatus = z.infer<typeof productionRunStatusSchema>

export const assetProductionRunSchema = z.object({
  runId: id,
  planId: id,
  planHash: sha256,
  status: productionRunStatusSchema,
  tasks: z.record(z.string(), productionTaskStateSchema),
  startedAt: timestamp,
  completedAt: timestamp.optional(),
}).strict()
export type AssetProductionRun = z.infer<typeof assetProductionRunSchema>

export const assetProductionSnapshotSchema = z.object({
  version: z.literal('asset-production-snapshot.v1'),
  revision: z.number().int().nonnegative(),
  plans: z.record(z.string(), assetProductionPlanSchema),
  runs: z.record(z.string(), assetProductionRunSchema),
  activePlanId: id.optional(),
  activeRunId: id.optional(),
}).strict()
export type AssetProductionSnapshot = z.infer<typeof assetProductionSnapshotSchema>

export function emptyAssetProductionSnapshot(): AssetProductionSnapshot {
  return {
    version: 'asset-production-snapshot.v1',
    revision: 0,
    plans: {},
    runs: {},
  }
}
