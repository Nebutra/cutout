import type {
  ProductionArtifactRef,
  ProductionDecisionReceipt,
  ProductionIssue,
  ProductionTaskState,
} from './contracts'

export function integrityIssue(
  code: string,
  message: string,
  recordedAt = Date.now(),
): ProductionIssue {
  return {
    code,
    kind: 'integrity',
    message,
    waivable: false,
    source: 'deterministic-check',
    recordedAt,
  }
}

export function qualityIssue(
  code: string,
  message: string,
  source: ProductionIssue['source'] = 'model-review',
  recordedAt = Date.now(),
): ProductionIssue {
  return { code, kind: 'quality', message, waivable: true, source, recordedAt }
}

export function warningIssue(
  code: string,
  message: string,
  recordedAt = Date.now(),
): ProductionIssue {
  return {
    code,
    kind: 'warning',
    message,
    waivable: true,
    source: 'runtime',
    recordedAt,
  }
}

export function hasIntegrityBlocker(issues: readonly ProductionIssue[]): boolean {
  return issues.some((issue) => issue.kind === 'integrity')
}

export function hasQualityBlocker(issues: readonly ProductionIssue[]): boolean {
  return issues.some((issue) => issue.kind === 'quality')
}

export function issuesAreWaivable(issues: readonly ProductionIssue[]): boolean {
  return issues.length > 0 && issues.every((issue) => issue.kind !== 'integrity' && issue.waivable)
}

export function assertDecisionMatches(
  task: ProductionTaskState,
  decision: ProductionDecisionReceipt,
  projectRevisionId: string,
): void {
  const artifact = decisionArtifact(task)
  if (!artifact) throw new Error('A production decision requires a candidate or output artifact.')
  if (decision.taskId !== task.taskId) throw new Error('Production decision targets another task.')
  if (decision.artifactSha256 !== artifact.sha256) {
    throw new Error('Production decision targets a stale artifact revision.')
  }
  if (decision.projectRevisionId !== projectRevisionId) {
    throw new Error('Production decision targets a stale project revision.')
  }
  const issueCodes = new Set(task.issues.map((issue) => issue.code))
  if (decision.issueCodes.some((code) => !issueCodes.has(code))) {
    throw new Error('Production decision references an issue not present on this task.')
  }
  if (!issuesAreWaivable(task.issues)) {
    throw new Error('This production task has non-waivable or no blocking issues.')
  }
}

export function isConsumableTask(task: ProductionTaskState): boolean {
  return task.status === 'ready' || task.status === 'waived' || task.status === 'legacy-ready'
}

function decisionArtifact(task: ProductionTaskState): ProductionArtifactRef | undefined {
  return task.output ?? task.candidate
}

