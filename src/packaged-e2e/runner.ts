import { invoke } from '@tauri-apps/api/core'
import { DESKTOP_IMAGE_TOOL_TIMEOUT_MS } from '@/agent-runtime/paid-tool-timeouts'
import {
  createMonotonicDeadline,
  type MonotonicDeadline,
} from '@/platform/monotonic-deadline'
import { parsePrototypeRouteGraphFingerprint } from '@/prototype/prototype-plan'
import type { PackagedE2eDesignCandidateOwnerStage } from './design-candidate-owner'

type PhaseId =
  | 'bootstrap'
  | 'settings-opened'
  | 'ai-configured'
  | 'settings-closed'
  | 'home-ready'
  | 'casual-chat-submitted'
  | 'provider-response'
  | 'creative-brief-submitted'
  | 'planner-complete'
  | 'run-retried'
  | 'design-candidates-ready'
  | 'design-candidate-selected'
  | 'prototype-suite-ready'
  | 'prototype-suite-selected'
  | 'resource-pack-ready'

type QualityAttentionPhaseId =
  | `quality-page-rejected-${number}`
  | `quality-page-unavailable-${number}`
  | `quality-resource-rejected-${number}`
  | `quality-resource-unavailable-${number}`
  | `quality-resource-observational-${number}`
  | 'quality-diagnostic-unavailable-1'

interface Phase {
  readonly id: PhaseId | QualityAttentionPhaseId
  readonly status: 'passed' | 'failed' | 'skipped'
}

export interface PackagedE2eQualitySummary {
  readonly candidateId: string
  readonly pageRejectedCount: number
  readonly pageUnavailableCount: number
  readonly resourceRejectedCount: number
  readonly resourceUnavailableCount: number
  readonly resourceObservationalIssueCount: number
}

export interface PackagedE2eCandidateOutcome {
  readonly candidateId: string
  readonly status: 'ready'
}

export interface PackagedE2eSuiteOutcome extends PackagedE2eCandidateOutcome {
  readonly designSystemId: string
  readonly resourcePackId: string
  readonly routes: readonly string[]
  readonly routeCount: number
  readonly pageCount: number
  readonly resourceAssetCount: number
  readonly artifactCount: number
  readonly qualityReviewStatus: 'passed'
  readonly routeGraph: string
  readonly designSystemMedia: PackagedE2eMediaEvidence
  readonly pageMedia: readonly PackagedE2ePageMediaEvidence[]
  readonly resourceMedia: readonly PackagedE2eResourceMediaEvidence[]
  readonly digests: PackagedE2eDeliveryDigests
}

export interface PackagedE2eMediaEvidence {
  readonly mediaType: string
  readonly width: number
  readonly height: number
  readonly sha256: string
}

export interface PackagedE2ePageMediaEvidence extends PackagedE2eMediaEvidence {
  readonly ordinal: number
  readonly route: string
}

export interface PackagedE2eResourceMediaEvidence extends PackagedE2eMediaEvidence {
  readonly ordinal: number
  readonly byteLength: number
}

export interface PackagedE2eDeliveryDigests {
  readonly plan: string
  readonly designSystemImage: string
  readonly designMarkdown: string
  readonly cssVariables: string
  readonly tailwindTheme: string
  readonly tokensJson: string
  readonly designIrTokens: string
  readonly routeGraph: string
  readonly pageMedia: string
  readonly manifest: string
  readonly bindings: string
  readonly resourcePack: string
  readonly resourceArtifacts: string
  readonly provenance: string
  readonly reviewDocument: string
  readonly pageReviews: string
  readonly resourceReviews: string
}

export type PackagedE2eCaptureId =
  | 'design-systems'
  | 'prototype-suites'
  | 'selected-delivery'
  | 'failure'

export interface PackagedE2eCaptureEvidence {
  readonly id: PackagedE2eCaptureId
  readonly sha256: string
  readonly width: number
  readonly height: number
  readonly byteLength: number
}

export interface PackagedE2eIntentEvidence {
  readonly text: string
  readonly sha256: string
}

export interface PackagedE2eOutcome {
  readonly intent: PackagedE2eIntentEvidence
  readonly designSystems: readonly PackagedE2eCandidateOutcome[]
  readonly prototypeSuites: readonly PackagedE2eSuiteOutcome[]
  readonly captures: readonly PackagedE2eCaptureEvidence[]
  readonly evidence: PackagedE2eEvidenceManifest
  readonly selectedSuiteId: string
  readonly selectedVisibleSliceCount: number
  readonly planningTurnCount: number
  readonly planningRuntimeCounts: PackagedE2ePlanningRuntimeCounts
  readonly plannedImageCallCount: number
  readonly imageCallCount: number
  readonly retryCount: number
  readonly retryImageCallCount: number
}

export interface PackagedE2eProviderRouteEvidence {
  readonly purpose: 'planning' | 'image' | 'vision'
  readonly kind: string
  readonly model: string
  readonly classification: 'remote' | 'local'
}

export interface PackagedE2eEvidenceFile {
  readonly role: string
  readonly candidateId?: string
  readonly ordinal?: number
  readonly path: string
  readonly sha256: string
  readonly byteLength: number
  readonly mediaType?: string
  readonly width?: number
  readonly height?: number
}

export interface PackagedE2eEvidenceManifest {
  readonly protocol: 'cutout.packaged-e2e-evidence.v1'
  readonly providerRoutes: readonly PackagedE2eProviderRouteEvidence[]
  readonly files: readonly PackagedE2eEvidenceFile[]
}

interface PackagedE2eEvidenceUploadFile {
  readonly role: string
  readonly candidateId?: string
  readonly ordinal?: number
  readonly sha256: string
  readonly byteLength: number
  readonly bytesBase64: string
  readonly mediaType?: string
  readonly width?: number
  readonly height?: number
}

export interface PackagedE2ePlanningRuntimeCounts {
  readonly codexSystem: number
  readonly direct: number
}

export type PackagedE2eFailureDiagnostic =
  | 'planner-structured-contract'
  | 'planner-timeout'
  | 'planner-progressive-outline'
  | 'planner-progressive-design-foundation'
  | 'planner-progressive-design-exploration'
  | 'planner-progressive-design-bounds'
  | 'planner-progressive-page'
  | 'planner-progressive-page-identity'
  | 'planner-progressive-closure'
  | 'planner-progressive-merge'
  | 'planner-progressive-graph'
  | 'planner-progressive-coverage'
  | 'provider-auth'
  | 'provider-configuration-state'
  | 'provider-transport'
  | 'provider-output'
  | 'prototype-viewport'
  | 'board-decode'
  | 'board-composition'
  | 'board-zero-slices'
  | 'board-slot-assignment'
  | 'artifact-persistence'
  | 'generation-candidate'
  | 'orchestration-state'
  | 'quality-review-required'
  | 'planning-evidence-mismatch'
  | 'candidate-preparation-timeout'
  | 'candidate-approval-timeout'
  | 'candidate-provider-timeout'
  | 'candidate-post-processing-timeout'
  | 'unknown'

export interface PackagedE2ePlannerProgress {
  readonly stage:
    | 'outline'
    | 'design-foundation'
    | 'design-exploration'
    | 'page'
    | 'closure'
    | 'complete'
  readonly completedPages: number
  readonly totalPages: number
}

export type PackagedE2ePipelineStage =
  | 'tool-gate'
  | 'image-route-catalogued'
  | 'image-execution-started'
  | 'image-execution-proven'
  | 'research-brief'
  | 'planner'
  | 'planner-complete'

export interface PackagedE2eDesignCandidateProgress {
  readonly candidateId: `design-${number}`
  readonly status: 'proposed' | 'generating' | 'ready' | 'failed' | 'cancelled'
  readonly ownerStage: PackagedE2eDesignCandidateOwnerStage
}

export interface PackagedE2ePrototypeSuiteProgress {
  readonly candidateId: `suite-${number}`
  readonly status: 'proposed' | 'generating' | 'ready' | 'failed' | 'cancelled'
  readonly completedPages: number
  readonly totalPages: number
  readonly completedResources: number
  readonly totalResources: number
  readonly generatingPages: number
  readonly reviewingPages: number
  readonly retryingPages: number
  readonly rejectedPages: number
}

export interface PackagedE2ePrototypeSuiteCheckpoint {
  readonly key: string
  readonly id: string
  readonly status: 'passed' | 'failed'
}

type FailureCode =
  | 'phase-rejected'
  | 'element-timeout'
  | 'journey-timeout'
  | 'capability-missing'
  | 'run-failed'
  | 'candidate-failed'
  | 'suite-failed'
  | 'unexpected'

const phases: Phase[] = []
const plannerCheckpoints = new Map<string, string>()
const pipelineCheckpoints = new Set<string>()
const designCandidateCheckpoints = new Set<string>()
const prototypeSuiteCheckpoints = new Set<string>()

export const PACKAGED_E2E_CASUAL_PROMPT =
  '最近我总觉得整理旅行灵感很麻烦。想做一个安静但有探索感的旅行计划工具。这一步只进行对话和需求梳理，请先和我聊聊应该从什么体验开始，不要生成设计、原型或素材。'

export const PACKAGED_E2E_CREATIVE_BRIEF = [
  '请把这个想法做成可交付的旅行规划 Web App。',
  '请根据这个业务场景和真正有决策价值的视觉差异，判断应提供多少套 Design System 方向；方向数量由你决定，每套都必须意义明确且彼此不同。',
  '请从旅行规划的业务场景、内容模型、关键用户旅程和 Web 平台最佳实践推导每套完整且可互相导航的路由拓扑；页面数量由你判断，不能只做 Landing Page，也不要为凑数添加通用页面。',
  '请逐页识别真正不可由代码高保真重建、且值得复用的非 UI 视觉素材；数量与生产方式由素材价值和页面场景决定，不要为凑数把普通 UI 容器当素材。页面完成后进入切片和资源生产。',
].join('\n')

export const PACKAGED_E2E_MAX_CANDIDATE_COUNT = 8
export const PACKAGED_E2E_MAX_DELIVERY_EVIDENCE_LENGTH = 256 * 1024 * 1024
export const PACKAGED_E2E_PER_SUITE_TIMEOUT_MS = 45 * 60_000
export const PACKAGED_E2E_ALL_SUITES_TIMEOUT_MS =
  PACKAGED_E2E_MAX_CANDIDATE_COUNT * PACKAGED_E2E_PER_SUITE_TIMEOUT_MS
export const PACKAGED_E2E_MAX_RETRIES_PER_FAILURE_FRONTIER = 2
export const PACKAGED_E2E_MAX_RUN_RETRIES = PACKAGED_E2E_MAX_CANDIDATE_COUNT * 2
export const PACKAGED_E2E_RETRY_UI_GRACE_MS = 5_000
export const PACKAGED_E2E_SUITE_SETTLEMENT_GRACE_MS = 2 * 60_000
export const PACKAGED_E2E_CANDIDATE_OWNER_DEADLINES_MS = {
  preparing: 30_000,
  'awaiting-approval': 30_000,
  'provider-executing': DESKTOP_IMAGE_TOOL_TIMEOUT_MS + 15_000,
  'post-processing': 105_000,
} as const

export function packagedE2eSuiteTimeoutMs(candidateCount: number): number {
  if (!Number.isSafeInteger(candidateCount)
    || candidateCount < 1
    || candidateCount > PACKAGED_E2E_MAX_CANDIDATE_COUNT) {
    throw new Error('packaged-e2e-candidate-count-invalid')
  }
  return candidateCount * PACKAGED_E2E_PER_SUITE_TIMEOUT_MS
}

export interface PackagedE2eRetryTracker {
  readonly attemptsByFrontier: Map<string, number>
  totalAttempts: number
  pendingAttempt: number | null
}

export function createPackagedE2eRetryTracker(): PackagedE2eRetryTracker {
  return {
    attemptsByFrontier: new Map(),
    totalAttempts: 0,
    pendingAttempt: null,
  }
}

const runRetryTracker = createPackagedE2eRetryTracker()

export interface PackagedE2eCandidateOwnerWatch {
  readonly active: Map<string, {
    readonly stage: Exclude<PackagedE2eDesignCandidateOwnerStage, 'queued' | 'terminal'>
    readonly since: number
  }>
}

export function createPackagedE2eCandidateOwnerWatch(): PackagedE2eCandidateOwnerWatch {
  return { active: new Map() }
}

const candidateOwnerWatch = createPackagedE2eCandidateOwnerWatch()

interface PackagedE2eCandidateOwnerDeadlineMonitor {
  readonly active: Map<PackagedE2eDesignCandidateProgress['candidateId'], {
    readonly stage: Exclude<PackagedE2eDesignCandidateOwnerStage, 'queued' | 'terminal'>
    readonly deadline: MonotonicDeadline
  }>
  diagnostic?: PackagedE2eFailureDiagnostic
}

export function createPackagedE2eCandidateOwnerDeadlineMonitor(): PackagedE2eCandidateOwnerDeadlineMonitor {
  return { active: new Map() }
}

const candidateOwnerDeadlineMonitor = createPackagedE2eCandidateOwnerDeadlineMonitor()

export interface PackagedE2eSuiteSettlementWatch {
  settledWhileWorkingSince?: number
}

export function createPackagedE2eSuiteSettlementWatch(): PackagedE2eSuiteSettlementWatch {
  return {}
}

const suiteSettlementWatch = createPackagedE2eSuiteSettlementWatch()

/**
 * Background WKWebViews may stop advancing performance.now() and JavaScript
 * timers. Candidate deadlines must therefore be owned by the native monotonic
 * bridge, while this projection remains a pure, deterministic test seam.
 */
export function observePackagedE2eCandidateOwnerDeadlines(
  progress: readonly PackagedE2eDesignCandidateProgress[],
  monitor: PackagedE2eCandidateOwnerDeadlineMonitor = candidateOwnerDeadlineMonitor,
): PackagedE2eFailureDiagnostic | undefined {
  const observed = new Set(progress.map(({ candidateId }) => candidateId))
  for (const [candidateId, active] of monitor.active) {
    if (observed.has(candidateId)) continue
    active.deadline.cancel()
    monitor.active.delete(candidateId)
  }

  for (const candidate of progress) {
    if (candidate.ownerStage === 'queued' || candidate.ownerStage === 'terminal') {
      const active = monitor.active.get(candidate.candidateId)
      active?.deadline.cancel()
      monitor.active.delete(candidate.candidateId)
      continue
    }
    const active = monitor.active.get(candidate.candidateId)
    if (active?.stage === candidate.ownerStage) continue
    active?.deadline.cancel()
    const deadline = createMonotonicDeadline(
      PACKAGED_E2E_CANDIDATE_OWNER_DEADLINES_MS[candidate.ownerStage],
    )
    const entry = { stage: candidate.ownerStage, deadline }
    monitor.active.set(candidate.candidateId, entry)
    void deadline.elapsed.then((elapsed) => {
      if (!elapsed || monitor.active.get(candidate.candidateId) !== entry) return
      monitor.diagnostic ??= candidateOwnerTimeoutDiagnostic(entry.stage)
    })
  }
  return monitor.diagnostic
}

export function cancelPackagedE2eCandidateOwnerDeadlines(
  monitor: PackagedE2eCandidateOwnerDeadlineMonitor = candidateOwnerDeadlineMonitor,
): void {
  for (const { deadline } of monitor.active.values()) deadline.cancel()
  monitor.active.clear()
  monitor.diagnostic = undefined
}

function candidateOwnerTimeoutDiagnostic(
  stage: Exclude<PackagedE2eDesignCandidateOwnerStage, 'queued' | 'terminal'>,
): PackagedE2eFailureDiagnostic {
  switch (stage) {
    case 'preparing': return 'candidate-preparation-timeout'
    case 'awaiting-approval': return 'candidate-approval-timeout'
    case 'provider-executing': return 'candidate-provider-timeout'
    case 'post-processing': return 'candidate-post-processing-timeout'
  }
}

export function observePackagedE2eSuiteSettlement(
  progress: readonly PackagedE2ePrototypeSuiteProgress[],
  agentWorking: boolean,
  watch: PackagedE2eSuiteSettlementWatch = suiteSettlementWatch,
  now: number = performance.now(),
): boolean {
  const awaitingRunSettlement = agentWorking
    && progress.length > 0
    && progress.some(({ status }) => status === 'failed')
    && progress.every(({ status }) => status === 'ready' || status === 'failed')
  if (!awaitingRunSettlement) {
    watch.settledWhileWorkingSince = undefined
    return false
  }
  watch.settledWhileWorkingSince ??= now
  return now - watch.settledWhileWorkingSince >= PACKAGED_E2E_SUITE_SETTLEMENT_GRACE_MS
}

export function observePackagedE2eCandidateOwners(
  progress: readonly PackagedE2eDesignCandidateProgress[],
  watch: PackagedE2eCandidateOwnerWatch = candidateOwnerWatch,
  now: number = performance.now(),
): PackagedE2eFailureDiagnostic | undefined {
  const observed = new Set<string>(progress.map(({ candidateId }) => candidateId))
  for (const candidateId of watch.active.keys()) {
    if (!observed.has(candidateId)) watch.active.delete(candidateId)
  }
  for (const candidate of progress) {
    if (candidate.ownerStage === 'queued' || candidate.ownerStage === 'terminal') {
      watch.active.delete(candidate.candidateId)
      continue
    }
    const current = watch.active.get(candidate.candidateId)
    if (!current || current.stage !== candidate.ownerStage) {
      watch.active.set(candidate.candidateId, {
        stage: candidate.ownerStage,
        since: now,
      })
      continue
    }
    if (now - current.since < PACKAGED_E2E_CANDIDATE_OWNER_DEADLINES_MS[current.stage]) {
      continue
    }
    switch (current.stage) {
      case 'preparing': return 'candidate-preparation-timeout'
      case 'awaiting-approval': return 'candidate-approval-timeout'
      case 'provider-executing': return 'candidate-provider-timeout'
      case 'post-processing': return 'candidate-post-processing-timeout'
    }
  }
  return undefined
}

export function packagedE2ePlanningReady(setup: HTMLElement | null): boolean {
  if (!setup || setup.dataset.aiAutomaticBusy !== 'false') return false
  return setup
    .querySelector<HTMLElement>('[data-ai-capability="planning"]')
    ?.dataset.aiCapabilityStatus === 'ready'
}

export async function runPackagedE2e(): Promise<void> {
  const captures: PackagedE2eCaptureEvidence[] = []
  resetPackagedE2eDeadlineState()
  try {
    await pass('bootstrap')
    await waitFor(() => document.querySelector('#root')?.childElementCount)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', metaKey: true, bubbles: true }))
    const dialog = await waitFor(() => document.querySelector<HTMLElement>('[role="dialog"]'))
    await pass('settings-opened')
    const aiSection = dialog.querySelector<HTMLButtonElement>('[data-settings-section="ai"]')
    if (!aiSection) throw new JourneyFailure('settings-opened')
    aiSection.click()
    let planningGapSince: number | undefined
    let terminalSetupGapSince: number | undefined
    await waitFor(() => {
      const setup = document.querySelector<HTMLElement>('[data-ai-setup-status]')
      const status = setup?.dataset.aiSetupStatus
      const planningReady = packagedE2ePlanningReady(setup)
      const planningStatus = setup
        ?.querySelector<HTMLElement>('[data-ai-capability="planning"]')
        ?.dataset.aiCapabilityStatus
      if (planningStatus === 'action-required' && setup?.dataset.aiAutomaticBusy !== 'true') {
        planningGapSince ??= performance.now()
        if (performance.now() - planningGapSince > 5_000) {
          throw new JourneyFailure('ai-configured', 'capability-missing')
        }
      } else {
        planningGapSince = undefined
      }
      if (status && !['checking', 'ready', 'action-required'].includes(status)) {
        terminalSetupGapSince ??= performance.now()
        if (performance.now() - terminalSetupGapSince > 10_000) {
          throw new JourneyFailure('ai-configured', 'run-failed')
        }
      } else {
        terminalSetupGapSince = undefined
      }
      return planningReady
    }, 180_000)
    // Planning is independently usable before image routes are ready. The
    // later production stages still require and execution-prove image routes.
    await pass('ai-configured')

    const closeSettings = dialog.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')
    if (!closeSettings) throw new JourneyFailure('settings-closed')
    closeSettings.click()
    await waitFor(() => !document.querySelector('[role="dialog"]'))
    await pass('settings-closed')

    let composer = document.querySelector<HTMLTextAreaElement>(
      '[data-testid="home-composer-surface"] textarea',
    )
    if (!composer) {
      const home = document.querySelector<HTMLButtonElement>('[data-agent-action="open-home"]')
      if (!home) throw new JourneyFailure('home-ready')
      home.click()
      composer = await waitFor(() => document.querySelector<HTMLTextAreaElement>(
        '[data-testid="home-composer-surface"] textarea',
      ))
    }
    await pass('home-ready')
    const initialAgentMessageCount = agentMessageCount()
    setTextareaValue(composer, PACKAGED_E2E_CASUAL_PROMPT)
    composer.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', metaKey: true, bubbles: true,
    }))
    await pass('casual-chat-submitted')
    await waitFor(() => document.querySelector<HTMLElement>('[data-workspace-root]'))
    await waitForJourney(() => {
      const workspace = workspaceRoot()
      rejectFailedWorkspacePhase(workspace, 'provider-response')
      return workspace.dataset.agentWorking === 'true'
        || hasFreshAgentMessage(initialAgentMessageCount)
    }, 60_000)
    await waitForJourney(() => {
      const workspace = workspaceRoot()
      rejectFailedWorkspacePhase(workspace, 'provider-response')
      const settled = hasSettledFreshAgentResponse(workspace, initialAgentMessageCount)
      if (settled && numberData(workspace, 'packagedE2ePlanningTurnCount') < 1) {
        throw new JourneyFailure(
          'provider-response',
          'capability-missing',
          'planning-evidence-mismatch',
        )
      }
      return settled
    }, 300_000)
    await pass('provider-response')

    const agentComposer = await waitFor(() =>
      document.querySelector<HTMLTextAreaElement>('[aria-label="Message the Agent"]'))
    const previousRunId = workspaceRoot().dataset.packagedE2eActiveRunId ?? ''
    setTextareaValue(
      agentComposer,
      PACKAGED_E2E_CREATIVE_BRIEF,
    )
    agentComposer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await waitFor(() => {
      const workspace = workspaceRoot()
      return hasFreshCreativeSubmission(workspace, agentComposer, previousRunId)
    })
    await pass('creative-brief-submitted')

    await waitForJourney(() => {
      const workspace = workspaceRoot()
      rejectFailedWorkspacePhase(workspace, 'planner-complete')
      const progress = readWorkspacePlannerProgress(workspace)
      return progress?.stage === 'complete'
        && readWorkspacePipelineStages(workspace).includes('planner-complete')
    }, 45 * 60_000)
    await pass('planner-complete')

    let candidateCount = 0
    await waitForJourney(() => {
      const workspace = workspaceRoot()
      rejectFailedWorkspacePhase(workspace, 'design-candidates-ready')
      const observedCount = numberData(workspace, 'designCandidateCount')
      if (observedCount > PACKAGED_E2E_MAX_CANDIDATE_COUNT) {
        throw new JourneyFailure('design-candidates-ready', 'candidate-failed')
      }
      const ready = observedCount >= 1
        && numberData(workspace, 'designCandidateReadyCount') === observedCount
        && numberData(workspace, 'designCandidateFailedCount') === 0
        && (observedCount === 1
          || workspace.dataset.workflowPhase === 'design-system-selection')
      if (ready && numberData(workspace, 'packagedE2ePlanningTurnCount') < 2) {
        throw new JourneyFailure(
          'design-candidates-ready',
          'capability-missing',
          'planning-evidence-mismatch',
        )
      }
      if (ready) candidateCount = observedCount
      return ready
    }, 45 * 60_000)
    await pass('design-candidates-ready')

    if (candidateCount > 1) {
      const select = await waitFor(() =>
        document.querySelector<HTMLButtonElement>('[data-design-candidate-action="select"]:not(:disabled)'))
      captures.push(await capturePackagedE2eWindow('design-systems'))
      select.click()
    } else {
      captures.push(await capturePackagedE2eWindow('design-systems'))
    }
    await pass('design-candidate-selected')

    await waitForJourney(() => {
      const workspace = workspaceRoot()
      rejectFailedWorkspacePhase(workspace, 'prototype-suite-ready')
      const allSuitesSettled = numberData(workspace, 'prototypeSuiteCount') === candidateCount
        && numberData(workspace, 'prototypeSuiteReadyCount') === candidateCount
        && numberData(workspace, 'prototypeSuiteFailedCount') === 0
        && numberData(workspace, 'resourcePackCount') === candidateCount
        && workspace.dataset.agentWorking === 'false'
      if (!allSuitesSettled) return false
      return hasDeliveryEvidenceForEverySuite(workspace, candidateCount)
    }, packagedE2eSuiteTimeoutMs(candidateCount))
    const settledWorkspace = workspaceRoot()
    if (hasAttentionRequiredDeliveryEvidence(settledWorkspace)) {
      const qualityPhases = qualityAttentionPhaseEntries(settledWorkspace)
      phases.push(...qualityPhases)
      await invoke('packaged_e2e_checkpoint', { phases })
      await captureQualityAttentionEvidence(candidateCount)
      throw new JourneyFailure(
        'prototype-suite-ready',
        'suite-failed',
        'quality-review-required',
      )
    }
    if (!hasCompleteDeliveryEvidence(settledWorkspace)) {
      throw new JourneyFailure(
        'prototype-suite-ready',
        'suite-failed',
        'generation-candidate',
      )
    }
    await pass('prototype-suite-ready')

    if (candidateCount > 1) {
      const compareSuites = await waitFor(() =>
        document.querySelector<HTMLButtonElement>('[data-agent-action="compare-prototype-suites"]:not(:disabled)'))
      compareSuites.click()
      const selectSuite = await waitFor(() =>
        document.querySelector<HTMLButtonElement>('[data-suite-candidate-action="select"]:not(:disabled)'))
      captures.push(await capturePackagedE2eWindow('prototype-suites'))
      const selectedSuiteCandidateId = selectSuite.dataset.suiteCandidateId
      if (!selectedSuiteCandidateId) throw new JourneyFailure('prototype-suite-selected')
      selectSuite.click()
      await waitForJourney(
        () => workspaceRoot().dataset.selectedPrototypeSuiteId === selectedSuiteCandidateId,
        5 * 60_000,
      )
    } else {
      captures.push(await capturePackagedE2eWindow('prototype-suites'))
    }
    const selectedSuiteId = await waitFor(() =>
      readWorkspaceSelectedSuiteId(workspaceRoot()))
    await pass('prototype-suite-selected')
    if (candidateCount > 1) {
      const suiteDialog = document.querySelector<HTMLElement>('[role="dialog"]')
      const closeSuiteDialog = suiteDialog?.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')
      if (!closeSuiteDialog) throw new JourneyFailure('prototype-suite-selected')
      closeSuiteDialog.click()
      await waitFor(() => !hasVisibleDialog())
    }

    await waitForJourney(() => {
      const workspace = workspaceRoot()
      rejectFailedWorkspacePhase(workspace, 'resource-pack-ready')
      const selected = readSuites(workspace).find((suite) =>
        suite.candidateId === selectedSuiteId)
      if (!selected) return false
      return numberData(workspace, 'packagedE2eVisibleSliceCount') === selected.resourceAssetCount
        && workspace.dataset.productionStatus === 'completed'
    }, 45 * 60_000)
    await pass('resource-pack-ready')
    captures.push(await capturePackagedE2eWindow('selected-delivery'))
    const completedWorkspace = workspaceRoot()
    const evidence = await persistPackagedE2eEvidence(completedWorkspace)
    await complete('passed', undefined, collectPackagedE2eOutcome(
      completedWorkspace,
      await packagedE2eIntentEvidence(),
      captures,
      evidence,
    ))
  } catch (error) {
    const id = error instanceof JourneyFailure ? error.phase : nextPhase()
    const phaseIndex = phases.findIndex((phase) => phase.id === id)
    if (phaseIndex < 0) phases.push({ id, status: 'failed' })
    else phases[phaseIndex] = { id, status: 'failed' }
    const workspace = document.querySelector<HTMLElement>('[data-workspace-root]')
    const plannerProgress = readWorkspacePlannerProgress(workspace)
    try {
      await capturePackagedE2eWindow('failure')
    } catch {
      // The closed failure result remains authoritative when the host cannot
      // capture a renderable window. Never hide the original journey failure.
    }
    await complete('failed', {
      phase: id,
      code: failureCode(error),
      diagnostic: error instanceof JourneyFailure && error.diagnostic
        ? error.diagnostic
        : readWorkspaceFailureDiagnostic(workspace),
      ...(plannerProgress ? { plannerProgress } : {}),
    })
  } finally {
    resetPackagedE2eDeadlineState()
  }
}

function resetPackagedE2eDeadlineState(): void {
  candidateOwnerWatch.active.clear()
  suiteSettlementWatch.settledWhileWorkingSince = undefined
  cancelPackagedE2eCandidateOwnerDeadlines()
}

export class JourneyFailure extends Error {
  readonly phase: PhaseId
  readonly code: FailureCode
  readonly diagnostic?: PackagedE2eFailureDiagnostic

  constructor(
    phase: PhaseId,
    code: FailureCode = 'phase-rejected',
    diagnostic?: PackagedE2eFailureDiagnostic,
  ) {
    super(phase)
    this.phase = phase
    this.code = code
    this.diagnostic = diagnostic
  }
}

async function pass(id: PhaseId): Promise<void> {
  const existing = phases.findIndex((phase) => phase.id === id)
  if (existing < 0) phases.push({ id, status: 'passed' })
  else phases[existing] = { id, status: 'passed' }
  await invoke('packaged_e2e_checkpoint', { phases })
}

function nextPhase(): PhaseId {
  return ([
    'bootstrap', 'settings-opened', 'ai-configured', 'settings-closed', 'home-ready',
    'casual-chat-submitted',
    'provider-response', 'creative-brief-submitted', 'planner-complete', 'design-candidates-ready',
    'design-candidate-selected', 'prototype-suite-ready', 'prototype-suite-selected', 'resource-pack-ready',
  ] as const).find((id) => !phases.some((phase) => phase.id === id)) ?? 'resource-pack-ready'
}

async function complete(
  status: 'passed' | 'failed',
  failure?: {
    readonly phase: PhaseId
    readonly code: FailureCode
    readonly diagnostic?: PackagedE2eFailureDiagnostic
    readonly plannerProgress?: PackagedE2ePlannerProgress
  },
  outcome?: PackagedE2eOutcome,
): Promise<void> {
  await invoke('packaged_e2e_complete', {
    result: {
      protocol: 'cutout.packaged-e2e-result.v1',
      status,
      phases,
      failure,
      ...(outcome ? { outcome } : {}),
      completedAt: Date.now(),
    },
  })
}

export async function packagedE2eIntentEvidence(): Promise<PackagedE2eIntentEvidence> {
  return {
    text: PACKAGED_E2E_CREATIVE_BRIEF,
    sha256: await sha256Text(PACKAGED_E2E_CREATIVE_BRIEF),
  }
}

export async function capturePackagedE2eWindow(
  id: PackagedE2eCaptureId,
): Promise<PackagedE2eCaptureEvidence> {
  const value: unknown = await invoke('packaged_e2e_capture_window', { id })
  if (!isCaptureEvidence(value) || value.id !== id) {
    throw new JourneyFailure('resource-pack-ready', 'phase-rejected')
  }
  return value
}

export function readWorkspaceFailureDiagnostic(
  workspace: HTMLElement | null,
): PackagedE2eFailureDiagnostic {
  switch (workspace?.dataset.packagedE2eRunDiagnostic) {
    case 'planner-structured-contract':
    case 'planner-timeout':
    case 'planner-progressive-outline':
    case 'planner-progressive-design-foundation':
    case 'planner-progressive-design-exploration':
    case 'planner-progressive-design-bounds':
    case 'planner-progressive-page':
    case 'planner-progressive-page-identity':
    case 'planner-progressive-closure':
    case 'planner-progressive-merge':
    case 'planner-progressive-graph':
    case 'planner-progressive-coverage':
    case 'provider-auth':
    case 'provider-configuration-state':
    case 'provider-transport':
    case 'provider-output':
    case 'prototype-viewport':
    case 'board-decode':
    case 'board-composition':
    case 'board-zero-slices':
    case 'board-slot-assignment':
    case 'artifact-persistence':
    case 'generation-candidate':
    case 'orchestration-state':
    case 'quality-review-required':
    case 'planning-evidence-mismatch':
    case 'candidate-preparation-timeout':
    case 'candidate-approval-timeout':
    case 'candidate-provider-timeout':
    case 'candidate-post-processing-timeout':
      return workspace.dataset.packagedE2eRunDiagnostic
    default:
      return 'unknown'
  }
}

export function hasFreshCreativeSubmission(
  workspace: HTMLElement,
  composer: HTMLTextAreaElement,
  previousRunId: string,
): boolean {
  const runId = workspace.dataset.packagedE2eActiveRunId ?? ''
  return composer.value === ''
    && runId.length >= 1
    && runId.length <= 160
    && runId !== previousRunId
}

export function readWorkspacePlannerProgress(
  workspace: HTMLElement | null,
): PackagedE2ePlannerProgress | undefined {
  const stage = workspace?.dataset.packagedE2ePlannerStage
  if (
    !stage
    || ![
      'outline',
      'design-foundation',
      'design-exploration',
      'page',
      'closure',
      'complete',
    ].includes(stage)
  ) return undefined
  const completedPages = Number(workspace.dataset.packagedE2ePlannerCompletedPages)
  const totalPages = Number(workspace.dataset.packagedE2ePlannerTotalPages)
  if (
    !Number.isSafeInteger(completedPages)
    || !Number.isSafeInteger(totalPages)
    || completedPages < 0
    || totalPages < 0
    || totalPages > 12
    || completedPages > totalPages
  ) return undefined
  return {
    stage: stage as PackagedE2ePlannerProgress['stage'],
    completedPages,
    totalPages,
  }
}

export function readWorkspacePipelineStage(
  workspace: HTMLElement | null,
): PackagedE2ePipelineStage | undefined {
  switch (workspace?.dataset.packagedE2ePipelineStage) {
    case 'tool-gate':
    case 'image-route-catalogued':
    case 'image-execution-started':
    case 'image-execution-proven':
    case 'research-brief':
    case 'planner':
    case 'planner-complete':
      return workspace.dataset.packagedE2ePipelineStage
    default:
      return undefined
  }
}

export function readWorkspacePipelineStages(
  workspace: HTMLElement | null,
): readonly PackagedE2ePipelineStage[] {
  if (!workspace) return []
  const encoded = workspace.dataset.packagedE2ePipelineStages
  if (!encoded || encoded.length > 512) {
    const stage = readWorkspacePipelineStage(workspace)
    return stage ? [stage] : []
  }
  try {
    const parsed: unknown = JSON.parse(encoded)
    if (!Array.isArray(parsed) || parsed.length > 7) return []
    const stages: PackagedE2ePipelineStage[] = []
    for (const value of parsed) {
      if (typeof value !== 'string') return []
      const probe = document.createElement('div')
      probe.dataset.packagedE2ePipelineStage = value
      const stage = readWorkspacePipelineStage(probe)
      if (!stage || stages.includes(stage)) return []
      stages.push(stage)
    }
    return stages
  } catch {
    return []
  }
}

export function readWorkspacePlannerProgressHistory(
  workspace: HTMLElement | null,
): readonly PackagedE2ePlannerProgress[] {
  if (!workspace) return []
  const encoded = workspace.dataset.packagedE2ePlannerProgressHistory
  if (!encoded || encoded.length > 2048) {
    const progress = readWorkspacePlannerProgress(workspace)
    return progress ? [progress] : []
  }
  try {
    const parsed: unknown = JSON.parse(encoded)
    if (!Array.isArray(parsed) || parsed.length > 6) return []
    const history: PackagedE2ePlannerProgress[] = []
    for (const value of parsed) {
      if (!isRecord(value) || !hasOnlyKeys(value, ['stage', 'completedPages', 'totalPages'])) {
        return []
      }
      const probe = document.createElement('div')
      probe.dataset.packagedE2ePlannerStage = typeof value.stage === 'string' ? value.stage : ''
      probe.dataset.packagedE2ePlannerCompletedPages = String(value.completedPages)
      probe.dataset.packagedE2ePlannerTotalPages = String(value.totalPages)
      const progress = readWorkspacePlannerProgress(probe)
      if (!progress || history.some((item) => item.stage === progress.stage)) return []
      history.push(progress)
    }
    return history
  } catch {
    return []
  }
}

export function readWorkspacePlannerAttempt(
  workspace: HTMLElement | null,
): number | undefined {
  if (!workspace) return undefined
  const attempt = numberData(workspace, 'packagedE2ePlannerAttemptCount')
  return Number.isSafeInteger(attempt)
    && attempt >= 1
    && attempt <= PACKAGED_E2E_MAX_RUN_RETRIES + 1
    ? attempt
    : undefined
}

export function collectPackagedE2eOutcome(
  workspace: HTMLElement,
  intent: PackagedE2eIntentEvidence,
  captures: readonly PackagedE2eCaptureEvidence[],
  evidence: PackagedE2eEvidenceManifest,
): PackagedE2eOutcome {
  const designSystems = readCandidates(workspace, 'packagedE2eDesignCandidates', 'design')
  const prototypeSuites = readSuites(workspace)
  if (designSystems.length !== prototypeSuites.length) throw outcomeFailure()
  const designSystemIds = new Set(designSystems.map(({ candidateId }) => candidateId))
  const boundDesignSystemIds = new Set(prototypeSuites.map(({ designSystemId }) => designSystemId))
  const resourcePackIds = new Set(prototypeSuites.map(({ resourcePackId }) => resourcePackId))
  const routeGraphs = new Set(prototypeSuites.map((suite) => suite.routeGraph))
  const deliveryMediaHashes = prototypeSuites.flatMap((suite) => [
    suite.designSystemMedia.sha256,
    ...suite.pageMedia.map(({ sha256 }) => sha256),
    ...suite.resourceMedia.map(({ sha256 }) => sha256),
  ])
  if (
    routeGraphs.size !== prototypeSuites.length
    || new Set(deliveryMediaHashes).size !== deliveryMediaHashes.length
    || boundDesignSystemIds.size !== prototypeSuites.length
    || resourcePackIds.size !== prototypeSuites.length
    || ![...boundDesignSystemIds].every((id) => designSystemIds.has(id))
    || !prototypeSuites.every((suite, index) =>
      designSystems[index]?.candidateId === `design-${index + 1}`
      && suite.candidateId === `suite-${index + 1}`
      && suite.designSystemId === `design-${index + 1}`
      && suite.resourcePackId === `resource-pack-${index + 1}`)
    || !isIntentEvidence(intent)
    || !isCompleteCaptureEvidence(captures)
    || !isEvidenceManifest(evidence, prototypeSuites)
  ) {
    throw outcomeFailure()
  }

  const selectedSuiteId = readWorkspaceSelectedSuiteId(workspace)
  if (!selectedSuiteId) throw outcomeFailure()
  const selectedSuite = prototypeSuites.find((suite) => suite.candidateId === selectedSuiteId)
  if (!selectedSuite) {
    throw outcomeFailure()
  }
  const selectedVisibleSliceCount = readCount(
    workspace,
    'packagedE2eVisibleSliceCount',
    0,
    selectedSuite.resourceAssetCount,
  )
  if (selectedVisibleSliceCount !== selectedSuite.resourceAssetCount) throw outcomeFailure()
  const planningTurnCount = readCount(
    workspace,
    'packagedE2ePlanningTurnCount',
    2,
    256,
  )
  const planningRuntimeCounts = {
    codexSystem: readCount(
      workspace,
      'packagedE2eCodexPlanningTurnCount',
      0,
      planningTurnCount,
    ),
    direct: readCount(
      workspace,
      'packagedE2eDirectPlanningTurnCount',
      0,
      planningTurnCount,
    ),
  }
  if (
    planningRuntimeCounts.codexSystem + planningRuntimeCounts.direct
    !== planningTurnCount
  ) throw outcomeFailure()
  const plannedImageCallCount = readCount(
    workspace,
    'packagedE2ePlannedImageCallCount',
    1,
    4096,
  )
  const imageCallCount = readCount(
    workspace,
    'packagedE2eImageCallCount',
    plannedImageCallCount,
    plannedImageCallCount,
  )
  const retryCount = readCount(
    workspace,
    'packagedE2eRetryStartCount',
    0,
    PACKAGED_E2E_MAX_RUN_RETRIES,
  )
  const retryImageCallCount = readCount(
    workspace,
    'packagedE2eRetryImageCallCount',
    0,
    imageCallCount,
  )

  return {
    intent,
    designSystems,
    prototypeSuites,
    captures,
    evidence,
    selectedSuiteId,
    selectedVisibleSliceCount,
    planningTurnCount,
    planningRuntimeCounts,
    plannedImageCallCount,
    imageCallCount,
    retryCount,
    retryImageCallCount,
  }
}

export async function persistPackagedE2eEvidence(
  workspace: HTMLElement,
): Promise<PackagedE2eEvidenceManifest> {
  // Validate the delivery graph before moving any bytes across IPC.
  const suites = readSuites(workspace)
  const uploads = readSuiteEvidenceUploads(workspace)
  const designIrEncoded = workspace.dataset.packagedE2eDesignIr
  if (!designIrEncoded || designIrEncoded.length > 16 * 1024 * 1024) throw outcomeFailure()
  let designIr: unknown
  try {
    designIr = JSON.parse(designIrEncoded)
  } catch {
    throw outcomeFailure()
  }
  if (!isRecord(designIr) || designIr.version !== 'design-ir.v1') throw outcomeFailure()
  const designIrText = canonicalJson(designIr)
  const designIrBytes = new TextEncoder().encode(designIrText)
  uploads.unshift({
    role: 'designIr',
    sha256: await sha256Text(designIrText),
    byteLength: designIrBytes.byteLength,
    bytesBase64: bytesToBase64(designIrBytes),
  })
  const providerRoutes = readProviderRoutes(workspace)
  const value: unknown = await invoke('packaged_e2e_persist_evidence', {
    payload: { providerRoutes, files: uploads },
  })
  if (!isEvidenceManifest(value, suites)) throw outcomeFailure()
  return value
}

export function hasCompleteDeliveryEvidence(workspace: HTMLElement): boolean {
  try {
    return readSuites(workspace).length === numberData(workspace, 'prototypeSuiteCount')
  } catch {
    return false
  }
}

export function hasAttentionRequiredDeliveryEvidence(
  workspace: HTMLElement,
): boolean {
  try {
    return readJsonArray(
      workspace,
      'packagedE2eDeliveryEvidence',
      PACKAGED_E2E_MAX_DELIVERY_EVIDENCE_LENGTH,
    ).some((value) =>
      isRecord(value) && value.qualityReviewStatus === 'attention-required')
  } catch {
    return false
  }
}

export function hasDeliveryEvidenceForEverySuite(
  workspace: HTMLElement,
  candidateCount: number,
): boolean {
  if (!Number.isSafeInteger(candidateCount) || candidateCount < 1
    || candidateCount > PACKAGED_E2E_MAX_CANDIDATE_COUNT) return false
  try {
    return readJsonArray(
      workspace,
      'packagedE2eDeliveryEvidence',
      PACKAGED_E2E_MAX_DELIVERY_EVIDENCE_LENGTH,
    ).length === candidateCount
  } catch {
    return false
  }
}

export function readWorkspaceQualitySummaries(
  workspace: HTMLElement | null,
): readonly PackagedE2eQualitySummary[] {
  if (!workspace) return []
  try {
    const parsed = readJsonArray(workspace, 'packagedE2eQualitySummaries', 32_768)
    if (parsed.length < 1 || parsed.length > PACKAGED_E2E_MAX_CANDIDATE_COUNT) return []
    return parsed.map((value, index) => {
      if (!isRecord(value) || !hasOnlyKeys(value, [
        'candidateId',
        'pageRejectedCount',
        'pageUnavailableCount',
        'resourceRejectedCount',
        'resourceUnavailableCount',
        'resourceObservationalIssueCount',
      ]) || value.candidateId !== `suite-${index + 1}`) throw outcomeFailure()
      return {
        candidateId: `suite-${index + 1}`,
        pageRejectedCount: qualitySummaryCount(value.pageRejectedCount),
        pageUnavailableCount: qualitySummaryCount(value.pageUnavailableCount),
        resourceRejectedCount: qualitySummaryCount(value.resourceRejectedCount),
        resourceUnavailableCount: qualitySummaryCount(value.resourceUnavailableCount),
        resourceObservationalIssueCount: qualitySummaryCount(
          value.resourceObservationalIssueCount,
        ),
      }
    })
  } catch {
    return []
  }
}

function qualitySummaryCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 32_768) {
    throw outcomeFailure()
  }
  return value
}

export function qualityAttentionPhaseEntries(
  workspace: HTMLElement | null,
): readonly Phase[] {
  const summaries = readWorkspaceQualitySummaries(workspace)
  if (summaries.length === 0) {
    return [{ id: 'quality-diagnostic-unavailable-1', status: 'failed' }]
  }
  const categories = [
    ['pageRejectedCount', 'quality-page-rejected'],
    ['pageUnavailableCount', 'quality-page-unavailable'],
    ['resourceRejectedCount', 'quality-resource-rejected'],
    ['resourceUnavailableCount', 'quality-resource-unavailable'],
    ['resourceObservationalIssueCount', 'quality-resource-observational'],
  ] as const
  const entries = categories.flatMap(([key, id]) => {
    const count = summaries.reduce((total, summary) => total + summary[key], 0)
    return count > 0
      ? [{ id: `${id}-${count}` as QualityAttentionPhaseId, status: 'failed' as const }]
      : []
  })
  return entries.length > 0
    ? entries
    : [{ id: 'quality-diagnostic-unavailable-1', status: 'failed' }]
}

async function captureQualityAttentionEvidence(candidateCount: number): Promise<void> {
  if (candidateCount > 1) {
    const compare = document.querySelector<HTMLButtonElement>(
      '[data-agent-action="compare-prototype-suites"]:not(:disabled)',
    )
    if (compare) {
      compare.click()
      try {
        await waitFor(() => hasVisibleDialog(), 5_000)
      } catch {
        // The native capture still records the settled workspace projection.
      }
    }
  }
  try {
    await capturePackagedE2eWindow('prototype-suites')
  } catch {
    // Quality classification remains the terminal result if capture fails.
  }
}

export function readWorkspaceSelectedSuiteId(
  workspace: HTMLElement | null,
): string | undefined {
  const selectedSuiteId = workspace?.dataset.packagedE2eSelectedSuiteId
  return isOpaqueCandidateId(selectedSuiteId, 'suite') ? selectedSuiteId : undefined
}

export function hasVisibleDialog(root: ParentNode = document): boolean {
  const dialog = root.querySelector<HTMLElement>('[role="dialog"]')
  return Boolean(dialog && isVisibleControl(dialog))
}

function readCandidates(
  workspace: HTMLElement,
  key: keyof DOMStringMap,
  prefix: 'design' | 'suite',
): readonly PackagedE2eCandidateOutcome[] {
  const parsed = readJsonArray(workspace, key)
  if (parsed.length < 1 || parsed.length > PACKAGED_E2E_MAX_CANDIDATE_COUNT) {
    throw outcomeFailure()
  }
  const candidates = parsed.map((value) => {
    const keys = prefix === 'design'
      ? ['candidateId', 'status', 'ownerStage']
      : ['candidateId', 'status']
    if (!isRecord(value) || !hasOnlyKeys(value, keys)) {
      throw outcomeFailure()
    }
    if (!isOpaqueCandidateId(value.candidateId, prefix)
      || value.status !== 'ready'
      || (prefix === 'design' && value.ownerStage !== 'terminal')) {
      throw outcomeFailure()
    }
    return { candidateId: value.candidateId, status: 'ready' as const }
  })
  if (new Set(candidates.map(({ candidateId }) => candidateId)).size !== candidates.length) {
    throw outcomeFailure()
  }
  return candidates
}

function readSuites(workspace: HTMLElement): readonly PackagedE2eSuiteOutcome[] {
  const parsed = readJsonArray(
    workspace,
    'packagedE2eDeliveryEvidence',
    PACKAGED_E2E_MAX_DELIVERY_EVIDENCE_LENGTH,
  )
  if (parsed.length < 1 || parsed.length > PACKAGED_E2E_MAX_CANDIDATE_COUNT) {
    throw outcomeFailure()
  }
  const suites = parsed.map((value) => {
    if (
      !isRecord(value)
      || !hasOnlyKeys(value, [
        'candidateId',
        'designSystemId',
        'resourcePackId',
        'status',
        'routes',
        'routeCount',
        'pageCount',
        'resourceAssetCount',
        'artifactCount',
        'qualityReviewStatus',
        'routeGraph',
        'designSystemMedia',
        'pageMedia',
        'resourceMedia',
        'digests',
        'files',
      ])
      || !isOpaqueCandidateId(value.candidateId, 'suite')
      || !isOpaqueCandidateId(value.designSystemId, 'design')
      || !isOpaqueResourcePackId(value.resourcePackId)
      || value.status !== 'ready'
      || value.qualityReviewStatus !== 'passed'
      || typeof value.resourceAssetCount !== 'number'
      || !Number.isSafeInteger(value.resourceAssetCount)
      || typeof value.artifactCount !== 'number'
      || !Number.isSafeInteger(value.artifactCount)
      || typeof value.routeCount !== 'number'
      || !Number.isSafeInteger(value.routeCount)
      || typeof value.pageCount !== 'number'
      || !Number.isSafeInteger(value.pageCount)
      || !Array.isArray(value.routes)
      || value.routes.length < 1
      || value.routes.length > 12
      || value.resourceAssetCount < 0
      || value.resourceAssetCount > 4096
      || value.artifactCount !== value.resourceAssetCount
      || value.routeCount !== value.routes.length
      || value.pageCount !== value.routes.length
      || !value.routes.every(isBoundedRoute)
      || new Set(value.routes).size !== value.routes.length
      || !routeGraphMatchesRoutes(value.routeGraph, value.routes)
      || !isMediaEvidence(value.designSystemMedia)
      || !isPageMediaEvidence(value.pageMedia, value.routes)
      || !isResourceMediaEvidence(value.resourceMedia, value.resourceAssetCount)
      || !isDeliveryDigests(value.digests)
      || !isDeliveryEvidenceFiles(
        value.files,
        value.digests,
        value.designSystemMedia,
        value.pageMedia,
        value.resourceMedia,
      )
    ) {
      throw outcomeFailure()
    }
    return {
      candidateId: value.candidateId,
      designSystemId: value.designSystemId,
      resourcePackId: value.resourcePackId,
      status: 'ready' as const,
      routes: value.routes,
      routeCount: value.routeCount,
      pageCount: value.pageCount,
      resourceAssetCount: value.resourceAssetCount,
      artifactCount: value.artifactCount,
      qualityReviewStatus: 'passed' as const,
      routeGraph: value.routeGraph,
      designSystemMedia: value.designSystemMedia,
      pageMedia: value.pageMedia,
      resourceMedia: value.resourceMedia,
      digests: value.digests,
    }
  })
  if (new Set(suites.map(({ candidateId }) => candidateId)).size !== suites.length) {
    throw outcomeFailure()
  }
  return suites
}

function routeGraphMatchesRoutes(value: unknown, routes: readonly unknown[]): value is string {
  const graph = parsePrototypeRouteGraphFingerprint(value)
  return graph !== undefined
    && graph.pages.length === routes.length
    && graph.pages.every((page) => routes.includes(page.route))
}

const deliveryDocumentRoles = [
  'plan', 'designMarkdown', 'cssVariables', 'tailwindTheme', 'tokensJson',
  'designIrTokens', 'routeGraph', 'pageMedia', 'manifest', 'bindings',
  'resourcePack', 'resourceArtifacts', 'provenance', 'reviewDocument',
  'pageReviews', 'resourceReviews',
] as const

function isDeliveryEvidenceFiles(
  value: unknown,
  digests: unknown,
  designSystemMedia: unknown,
  pageMedia: unknown,
  resourceMedia: unknown,
): value is readonly PackagedE2eEvidenceUploadFile[] {
  if (!Array.isArray(value)
    || !isDeliveryDigests(digests)
    || !isMediaEvidence(designSystemMedia)
    || !Array.isArray(pageMedia)
    || !Array.isArray(resourceMedia)
    || value.length !== deliveryDocumentRoles.length + 1 + pageMedia.length + resourceMedia.length
  ) {
    return false
  }
  const semanticKeys = new Set<string>()
  for (const file of value) {
    if (!isEvidenceUploadFile(file)) return false
    const key = `${file.role}:${file.ordinal ?? 0}`
    if (semanticKeys.has(key)) return false
    semanticKeys.add(key)
  }
  if (!deliveryDocumentRoles.every((role) => value.some((file) =>
    file.role === role && file.ordinal === undefined && file.sha256 === digests[role]))) return false
  const design = value.find((file) => file.role === 'designSystemMedia')
  if (!design || design.ordinal !== undefined || design.sha256 !== digests.designSystemImage
    || !sameMediaFile(design, designSystemMedia)) return false
  if (!pageMedia.every((media, index) => isRecord(media) && value.some((file) =>
    file.role === 'pageMediaObject'
    && file.ordinal === index + 1
    && file.sha256 === media.sha256
    && sameMediaFile(file, media)))) return false
  return resourceMedia.every((media, index) => isRecord(media) && value.some((file) =>
    file.role === 'resourceMediaObject'
    && file.ordinal === index + 1
    && file.sha256 === media.sha256
    && file.byteLength === media.byteLength
    && sameMediaFile(file, media)))
}

function isEvidenceUploadFile(value: unknown): value is PackagedE2eEvidenceUploadFile {
  if (!isRecord(value)) return false
  const allowed = new Set([
    'role', 'ordinal', 'sha256', 'byteLength', 'bytesBase64', 'mediaType', 'width', 'height',
  ])
  const keys = Object.keys(value)
  if (keys.some((key) => !allowed.has(key))
    || !['role', 'sha256', 'byteLength', 'bytesBase64'].every((key) => keys.includes(key))
    || typeof value.role !== 'string'
    || ![
      ...deliveryDocumentRoles,
      'designSystemMedia', 'pageMediaObject', 'resourceMediaObject',
    ].includes(value.role)
    || !isSha256(value.sha256)
    || !Number.isSafeInteger(value.byteLength)
    || (value.byteLength as number) < 1
    || (value.byteLength as number) > 128 * 1024 * 1024
    || typeof value.bytesBase64 !== 'string'
    || value.bytesBase64.length < 4
    || value.bytesBase64.length > Math.ceil((value.byteLength as number) / 3) * 4 + 4
    || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value.bytesBase64)
  ) return false
  const media = ['designSystemMedia', 'pageMediaObject', 'resourceMediaObject']
    .includes(value.role)
  if (!media) {
    return value.ordinal === undefined
      && value.mediaType === undefined
      && value.width === undefined
      && value.height === undefined
  }
  return (value.role === 'designSystemMedia'
    ? value.ordinal === undefined
    : Number.isSafeInteger(value.ordinal) && (value.ordinal as number) >= 1)
    && isBoundedImageMediaType(value.mediaType)
    && isBoundedDimension(value.width)
    && isBoundedDimension(value.height)
}

function sameMediaFile(
  file: Pick<PackagedE2eEvidenceUploadFile, 'mediaType' | 'width' | 'height'>,
  media: { readonly mediaType?: unknown; readonly width?: unknown; readonly height?: unknown },
): boolean {
  return file.mediaType === media.mediaType
    && file.width === media.width
    && file.height === media.height
}

function readSuiteEvidenceUploads(workspace: HTMLElement): PackagedE2eEvidenceUploadFile[] {
  const parsed = readJsonArray(
    workspace,
    'packagedE2eDeliveryEvidence',
    PACKAGED_E2E_MAX_DELIVERY_EVIDENCE_LENGTH,
  )
  return parsed.flatMap((suite) => {
    if (!isRecord(suite) || !isOpaqueCandidateId(suite.candidateId, 'suite')
      || !Array.isArray(suite.files)) throw outcomeFailure()
    const candidateId = suite.candidateId
    return suite.files.map((file) => {
      if (!isEvidenceUploadFile(file)) throw outcomeFailure()
      return { ...file, candidateId }
    })
  })
}

function readProviderRoutes(workspace: HTMLElement): readonly PackagedE2eProviderRouteEvidence[] {
  const encoded = workspace.dataset.packagedE2eProviderRoutes
  if (!encoded || encoded.length > 8_192) throw outcomeFailure()
  let value: unknown
  try {
    value = JSON.parse(encoded)
  } catch {
    throw outcomeFailure()
  }
  if (!isProviderRoutes(value)) throw outcomeFailure()
  return value
}

function isProviderRoutes(value: unknown): value is readonly PackagedE2eProviderRouteEvidence[] {
  return Array.isArray(value)
    && value.length >= 1
    && value.length <= 3
    && new Set(value.map((route) => isRecord(route) ? route.purpose : undefined)).size
      === value.length
    && value.every((route) => isRecord(route)
      && hasOnlyKeys(route, ['purpose', 'kind', 'model', 'classification'])
      && ['planning', 'image', 'vision'].includes(String(route.purpose))
      && typeof route.kind === 'string'
      && /^[a-z0-9][a-z0-9._-]{0,119}$/u.test(route.kind)
      && typeof route.model === 'string'
      && route.model.length >= 1
      && route.model.length <= 256
      && ![...route.model].some((character) => {
        const code = character.charCodeAt(0)
        return code < 32 || code === 127
      })
      && ['remote', 'local'].includes(String(route.classification)))
    && value.some((route) => isRecord(route)
      && route.purpose === 'image' && route.classification === 'remote')
}

function isEvidenceManifest(
  value: unknown,
  suites: readonly PackagedE2eSuiteOutcome[],
): value is PackagedE2eEvidenceManifest {
  if (!isRecord(value)
    || !hasOnlyKeys(value, ['protocol', 'providerRoutes', 'files'])
    || value.protocol !== 'cutout.packaged-e2e-evidence.v1'
    || !isProviderRoutes(value.providerRoutes)
    || !Array.isArray(value.files)
  ) return false
  const files = value.files
  if (files.length !== 1 + suites.reduce(
    (count, suite) => count + deliveryDocumentRoles.length + 1
      + suite.pageMedia.length + suite.resourceMedia.length,
    0,
  )) return false
  const semanticKeys = new Set<string>()
  for (const file of files) {
    if (!isEvidenceManifestFile(file)) return false
    const key = `${file.candidateId ?? 'global'}:${file.role}:${file.ordinal ?? 0}`
    if (semanticKeys.has(key)) return false
    semanticKeys.add(key)
  }
  if (!files.some((file) => isRecord(file)
    && file.role === 'designIr' && file.candidateId === undefined)) return false
  return suites.every((suite) => {
    const suiteFiles = files.filter((file) => isRecord(file)
      && file.candidateId === suite.candidateId)
    return deliveryDocumentRoles.every((role) => suiteFiles.some((file) =>
      isRecord(file) && file.role === role && file.sha256 === suite.digests[role]))
      && suiteFiles.some((file) => isRecord(file)
        && file.role === 'designSystemMedia'
        && file.sha256 === suite.designSystemMedia.sha256)
      && suite.pageMedia.every((media) => suiteFiles.some((file) => isRecord(file)
        && file.role === 'pageMediaObject'
        && file.ordinal === media.ordinal
        && file.sha256 === media.sha256))
      && suite.resourceMedia.every((media) => suiteFiles.some((file) => isRecord(file)
        && file.role === 'resourceMediaObject'
        && file.ordinal === media.ordinal
        && file.sha256 === media.sha256))
  })
}

function isEvidenceManifestFile(value: unknown): value is PackagedE2eEvidenceFile {
  if (!isRecord(value)) return false
  const allowed = new Set([
    'role', 'candidateId', 'ordinal', 'path', 'sha256', 'byteLength',
    'mediaType', 'width', 'height',
  ])
  const keys = Object.keys(value)
  return keys.every((key) => allowed.has(key))
    && ['role', 'path', 'sha256', 'byteLength'].every((key) => keys.includes(key))
    && typeof value.role === 'string'
    && value.role.length >= 1 && value.role.length <= 64
    && (value.candidateId === undefined || isOpaqueCandidateId(value.candidateId, 'suite'))
    && (value.ordinal === undefined
      || Number.isSafeInteger(value.ordinal) && (value.ordinal as number) >= 1)
    && isSha256(value.sha256)
    && value.path === `objects/${value.sha256}`
    && Number.isSafeInteger(value.byteLength)
    && (value.byteLength as number) >= 1
    && (value.byteLength as number) <= 128 * 1024 * 1024
    && (value.mediaType === undefined || isBoundedImageMediaType(value.mediaType))
    && (value.width === undefined || isBoundedDimension(value.width))
    && (value.height === undefined || isBoundedDimension(value.height))
}

function readJsonArray(
  workspace: HTMLElement,
  key: keyof DOMStringMap,
  maximumLength = 8192,
): readonly unknown[] {
  const encoded = workspace.dataset[key]
  if (!encoded || encoded.length > maximumLength) throw outcomeFailure()
  try {
    const parsed: unknown = JSON.parse(encoded)
    if (!Array.isArray(parsed)) throw outcomeFailure()
    return parsed
  } catch {
    throw outcomeFailure()
  }
}

function readCount(
  workspace: HTMLElement,
  key: keyof DOMStringMap,
  minimum: number,
  maximum: number,
): number {
  const value = Number(workspace.dataset[key])
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw outcomeFailure()
  }
  return value
}

function isOpaqueCandidateId(value: unknown, prefix: 'design' | 'suite'): value is string {
  if (typeof value !== 'string') return false
  const match = new RegExp(`^${prefix}-([1-9][0-9]*)$`).exec(value)
  return Boolean(match && Number(match[1]) <= PACKAGED_E2E_MAX_CANDIDATE_COUNT)
}

function isOpaqueResourcePackId(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^resource-pack-([1-9][0-9]*)$/.exec(value)
  return Boolean(match && Number(match[1]) <= PACKAGED_E2E_MAX_CANDIDATE_COUNT)
}

function isDeliveryDigests(value: unknown): value is PackagedE2eDeliveryDigests {
  const keys = [
    'plan',
    'designSystemImage',
    'designMarkdown',
    'cssVariables',
    'tailwindTheme',
    'tokensJson',
    'designIrTokens',
    'routeGraph',
    'pageMedia',
    'manifest',
    'bindings',
    'resourcePack',
    'resourceArtifacts',
    'provenance',
    'reviewDocument',
    'pageReviews',
    'resourceReviews',
  ] as const
  return isRecord(value)
    && hasOnlyKeys(value, keys)
    && keys.every((key) => typeof value[key] === 'string' && /^[a-f0-9]{64}$/.test(value[key]))
}

function isMediaEvidence(value: unknown): value is PackagedE2eMediaEvidence {
  return isRecord(value)
    && hasOnlyKeys(value, ['mediaType', 'width', 'height', 'sha256'])
    && isBoundedImageMediaType(value.mediaType)
    && isBoundedDimension(value.width)
    && isBoundedDimension(value.height)
    && isSha256(value.sha256)
}

function isPageMediaEvidence(
  value: unknown,
  routes: readonly unknown[],
): value is readonly PackagedE2ePageMediaEvidence[] {
  return Array.isArray(value)
    && value.length === routes.length
    && new Set(value.map((item) => isRecord(item) ? item.sha256 : undefined)).size === value.length
    && value.every((item, index) => isRecord(item)
      && hasOnlyKeys(item, ['ordinal', 'route', 'mediaType', 'width', 'height', 'sha256'])
      && item.ordinal === index + 1
      && item.route === routes[index]
      && isMediaEvidence({
        mediaType: item.mediaType,
        width: item.width,
        height: item.height,
        sha256: item.sha256,
      }))
}

function isResourceMediaEvidence(
  value: unknown,
  resourceCount: number,
): value is readonly PackagedE2eResourceMediaEvidence[] {
  return Array.isArray(value)
    && value.length === resourceCount
    && new Set(value.map((item) => isRecord(item) ? item.sha256 : undefined)).size === value.length
    && value.every((item, index) => isRecord(item)
      && hasOnlyKeys(item, [
        'ordinal', 'mediaType', 'width', 'height', 'byteLength', 'sha256',
      ])
      && item.ordinal === index + 1
      && Number.isSafeInteger(item.byteLength)
      && (item.byteLength as number) >= 1
      && (item.byteLength as number) <= 128 * 1024 * 1024
      && isMediaEvidence({
        mediaType: item.mediaType,
        width: item.width,
        height: item.height,
        sha256: item.sha256,
      }))
}

function isIntentEvidence(value: unknown): value is PackagedE2eIntentEvidence {
  return isRecord(value)
    && hasOnlyKeys(value, ['text', 'sha256'])
    && value.text === PACKAGED_E2E_CREATIVE_BRIEF
    && isSha256(value.sha256)
}

function isCaptureEvidence(value: unknown): value is PackagedE2eCaptureEvidence {
  return isRecord(value)
    && hasOnlyKeys(value, ['id', 'sha256', 'width', 'height', 'byteLength'])
    && ['design-systems', 'prototype-suites', 'selected-delivery', 'failure']
      .includes(String(value.id))
    && isSha256(value.sha256)
    && isBoundedDimension(value.width)
    && isBoundedDimension(value.height)
    && Number.isSafeInteger(value.byteLength)
    && (value.byteLength as number) >= 1
    && (value.byteLength as number) <= 32 * 1024 * 1024
}

function isCompleteCaptureEvidence(
  captures: readonly PackagedE2eCaptureEvidence[],
): boolean {
  return captures.length === 3
    && captures.every(isCaptureEvidence)
    && new Set(captures.map(({ id }) => id)).size === captures.length
    && ['design-systems', 'prototype-suites', 'selected-delivery']
      .every((id) => captures.some((capture) => capture.id === id))
}

function isBoundedImageMediaType(value: unknown): value is string {
  return typeof value === 'string' && /^image\/(?:png|jpeg|webp)$/u.test(value)
}

function isBoundedDimension(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= 16_384
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (isRecord(value)) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, item]) =>
      `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

function isBoundedRoute(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 256
    && value.startsWith('/')
    && ![...value].some((character) => {
      const code = character.charCodeAt(0)
      return /\s/u.test(character) || code <= 31 || code === 127
    })
}

function isBoundedProgress(completed: unknown, total: unknown, maximum: number): boolean {
  return Number.isSafeInteger(completed)
    && Number.isSafeInteger(total)
    && (completed as number) >= 0
    && (total as number) >= 0
    && (total as number) <= maximum
    && (completed as number) <= (total as number)
}

function progressMilestones(
  completed: number,
  total: number,
  includeComplete: boolean,
): readonly (readonly [label: 'first' | 'half' | 'complete', completed: number])[] {
  if (total <= 0 || completed <= 0) return []
  const milestones: Array<readonly ['first' | 'half' | 'complete', number]> = []
  const append = (label: 'first' | 'half' | 'complete', threshold: number) => {
    if (completed < threshold || milestones.some(([, value]) => value === threshold)) return
    milestones.push([label, threshold])
  }
  append('first', 1)
  append('half', Math.ceil(total / 2))
  if (includeComplete) append('complete', total)
  return milestones
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = new Set(keys)
  const actual = Object.keys(value)
  return actual.length === expected.size && actual.every((key) => expected.has(key))
}

function outcomeFailure(): JourneyFailure {
  return new JourneyFailure('resource-pack-ready', 'phase-rejected')
}

function failureCode(error: unknown): FailureCode {
  if (error instanceof JourneyFailure) return error.code
  if (error instanceof Error && error.message === 'packaged-e2e-timeout') return 'element-timeout'
  if (error instanceof Error && error.message === 'packaged-e2e-journey-timeout') return 'journey-timeout'
  return 'unexpected'
}

async function waitFor<T>(read: () => T, timeoutMs = 30_000): Promise<NonNullable<T>> {
  const deadline = createPackagedE2eDeadline(timeoutMs)
  try {
    while (!deadline.expired()) {
      const value = read()
      if (value) return value as NonNullable<T>
      await yieldToUi()
    }
    throw new Error('packaged-e2e-timeout')
  } finally {
    deadline.cancel()
  }
}

async function waitForJourney(read: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = createPackagedE2eDeadline(timeoutMs)
  let retryUiGrace: PackagedE2eDeadline | undefined
  try {
    while (!deadline.expired()) {
      await checkpointPipelineStage()
      await checkpointPlannerStage()
      await checkpointDesignCandidateStages()
      await checkpointPrototypeSuiteStages()
      const candidateProgress = readWorkspaceDesignCandidateProgress(
        document.querySelector<HTMLElement>('[data-workspace-root]'),
      )
      const candidateDiagnostic = observePackagedE2eCandidateOwnerDeadlines(candidateProgress)
        ?? observePackagedE2eCandidateOwners(candidateProgress)
      if (candidateDiagnostic) {
        const cancelled = await cancelPackagedE2eActiveRun()
        throw new JourneyFailure(
          'design-candidates-ready',
          'journey-timeout',
          cancelled ? candidateDiagnostic : 'orchestration-state',
        )
      }
      const workspace = document.querySelector<HTMLElement>('[data-workspace-root]')
      if (observePackagedE2eSuiteSettlement(
        readWorkspacePrototypeSuiteProgress(workspace),
        workspace?.dataset.agentWorking === 'true',
      )) {
        await cancelPackagedE2eActiveRun()
        throw new JourneyFailure(
          'prototype-suite-ready',
          'journey-timeout',
          'orchestration-state',
        )
      }
      if (retryPendingRun()) {
        retryUiGrace?.cancel()
        retryUiGrace = undefined
        await pass('run-retried')
        await waitFor(
          () => hasRetryRunStarted(workspaceRoot()),
          2 * 60_000,
        )
        continue
      }
      if (workspaceRoot().dataset.runFailed === 'true'
        && workspaceRoot().dataset.agentWorking === 'false') {
        retryUiGrace ??= createPackagedE2eDeadline(PACKAGED_E2E_RETRY_UI_GRACE_MS)
        if (!retryUiGrace.expired()) {
          await yieldToUi()
          continue
        }
        retryUiGrace.cancel()
        retryUiGrace = undefined
      } else {
        retryUiGrace?.cancel()
        retryUiGrace = undefined
      }
      if (read()) return
      approvePendingTools()
      await yieldToUi()
    }
    throw new Error('packaged-e2e-journey-timeout')
  } finally {
    deadline.cancel()
    retryUiGrace?.cancel()
  }
}

export async function cancelPackagedE2eActiveRun(): Promise<boolean> {
  const cancel = document.querySelector<HTMLButtonElement>(
    '[data-agent-action="cancel-run"]:not(:disabled)',
  )
  if (!cancel) return false
  cancel.click()
  try {
    await waitFor(
      () => workspaceRoot().dataset.agentWorking === 'false',
      30_000,
    )
    return true
  } catch {
    return false
  }
}

export function retryUiGraceStartedAt(
  workspace: HTMLElement,
  current: number | undefined,
  now: number = performance.now(),
): number | undefined {
  return workspace.dataset.runFailed === 'true'
    && workspace.dataset.agentWorking === 'false'
    ? current ?? now
    : undefined
}

export function monotonicDeadline(
  timeoutMs: number,
  now: () => number = () => performance.now(),
): () => boolean {
  const deadline = now() + timeoutMs
  return () => now() >= deadline
}

interface PackagedE2eDeadline {
  expired(): boolean
  cancel(): void
}

/** Native deadlines cap at ten minutes. Long journey budgets compose bounded
 * native segments so a background renderer never becomes the clock owner. */
export function createPackagedE2eDeadline(timeoutMs: number): PackagedE2eDeadline {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('packaged-e2e-timeout-invalid')
  }
  const maximumSegmentMs = 10 * 60_000
  let expired = false
  let cancelled = false
  let current: MonotonicDeadline | undefined
  void (async () => {
    let remaining = timeoutMs
    while (remaining > 0 && !cancelled) {
      const segment = Math.min(remaining, maximumSegmentMs)
      const deadline = createMonotonicDeadline(segment)
      current = deadline
      const elapsed = await deadline.elapsed
      if (!elapsed || cancelled) return
      remaining -= segment
    }
    if (!cancelled) expired = true
  })()
  return {
    expired: () => expired,
    cancel: () => {
      if (cancelled) return
      cancelled = true
      current?.cancel()
    },
  }
}

export function readWorkspaceDesignCandidateProgress(
  workspace: HTMLElement | null,
): readonly PackagedE2eDesignCandidateProgress[] {
  if (!workspace) return []
  const encoded = workspace.dataset.packagedE2eDesignCandidates
  if (!encoded || encoded.length > 2048) return []
  try {
    const parsed: unknown = JSON.parse(encoded)
    if (!Array.isArray(parsed) || parsed.length > PACKAGED_E2E_MAX_CANDIDATE_COUNT) return []
    const progress: PackagedE2eDesignCandidateProgress[] = []
    for (const value of parsed) {
      if (
        !isRecord(value)
        || !hasOnlyKeys(value, ['candidateId', 'status', 'ownerStage'])
        || !isOpaqueCandidateId(value.candidateId, 'design')
        || !['proposed', 'generating', 'ready', 'failed', 'cancelled'].includes(
          typeof value.status === 'string' ? value.status : '',
        )
        || !isDesignCandidateOwnerStage(value.ownerStage)
        || !isDesignCandidateStageConsistent(
          value.status as PackagedE2eDesignCandidateProgress['status'],
          value.ownerStage,
        )
      ) return []
      progress.push({
        candidateId: value.candidateId as PackagedE2eDesignCandidateProgress['candidateId'],
        status: value.status as PackagedE2eDesignCandidateProgress['status'],
        ownerStage: value.ownerStage,
      })
    }
    return progress
  } catch {
    return []
  }
}

function isDesignCandidateOwnerStage(
  value: unknown,
): value is PackagedE2eDesignCandidateOwnerStage {
  return typeof value === 'string' && [
    'queued',
    'preparing',
    'awaiting-approval',
    'provider-executing',
    'post-processing',
    'terminal',
  ].includes(value)
}

function isDesignCandidateStageConsistent(
  status: PackagedE2eDesignCandidateProgress['status'],
  ownerStage: PackagedE2eDesignCandidateOwnerStage,
): boolean {
  if (status === 'proposed') return ownerStage === 'queued'
  if (status === 'generating') {
    return !['queued', 'terminal'].includes(ownerStage)
  }
  return ownerStage === 'terminal'
}

export function readWorkspacePrototypeSuiteProgress(
  workspace: HTMLElement | null,
): readonly PackagedE2ePrototypeSuiteProgress[] {
  if (!workspace) return []
  const encoded = workspace.dataset.packagedE2ePrototypeSuiteProgress
  if (!encoded || encoded.length > 4096) return []
  try {
    const parsed: unknown = JSON.parse(encoded)
    if (!Array.isArray(parsed) || parsed.length > PACKAGED_E2E_MAX_CANDIDATE_COUNT) return []
    const progress: PackagedE2ePrototypeSuiteProgress[] = []
    for (const value of parsed) {
      if (
        !isRecord(value)
        || !hasOnlyKeys(value, [
          'candidateId',
          'status',
          'completedPages',
          'totalPages',
          'completedResources',
          'totalResources',
          'generatingPages',
          'reviewingPages',
          'retryingPages',
          'rejectedPages',
        ])
        || !isOpaqueCandidateId(value.candidateId, 'suite')
        || !['proposed', 'generating', 'ready', 'failed', 'cancelled'].includes(
          typeof value.status === 'string' ? value.status : '',
        )
        || !isBoundedProgress(value.completedPages, value.totalPages, 12)
        || !isBoundedProgress(value.completedResources, value.totalResources, 4096)
        || !isBoundedProgress(value.generatingPages, value.totalPages, 12)
        || !isBoundedProgress(value.reviewingPages, value.totalPages, 12)
        || !isBoundedProgress(value.retryingPages, value.totalPages, 12)
        || !isBoundedProgress(value.rejectedPages, value.totalPages, 12)
      ) return []
      const item = {
        candidateId: value.candidateId as PackagedE2ePrototypeSuiteProgress['candidateId'],
        status: value.status as PackagedE2ePrototypeSuiteProgress['status'],
        completedPages: value.completedPages as number,
        totalPages: value.totalPages as number,
        completedResources: value.completedResources as number,
        totalResources: value.totalResources as number,
        generatingPages: value.generatingPages as number,
        reviewingPages: value.reviewingPages as number,
        retryingPages: value.retryingPages as number,
        rejectedPages: value.rejectedPages as number,
      }
      const activePageStates = item.generatingPages
        + item.reviewingPages
        + item.retryingPages
        + item.rejectedPages
      if (
        (item.status === 'proposed' && (
          item.completedPages !== 0
          || item.totalPages !== 0
          || item.completedResources !== 0
          || item.totalResources !== 0
          || activePageStates !== 0
        ))
        || (item.status === 'ready' && (
          item.totalPages === 0
          || item.completedPages !== item.totalPages
          || item.completedResources !== item.totalResources
          || activePageStates !== 0
        ))
        || activePageStates > item.totalPages
        || progress.some(({ candidateId }) => candidateId === item.candidateId)
      ) return []
      progress.push(item)
    }
    return progress
  } catch {
    return []
  }
}

export function prototypeSuiteProgressCheckpointEntries(
  progress: PackagedE2ePrototypeSuiteProgress,
): readonly PackagedE2ePrototypeSuiteCheckpoint[] {
  if (progress.status === 'proposed') return []
  const ordinal = progress.candidateId.slice('suite-'.length)
  const counts = `pages-${progress.completedPages}-of-${progress.totalPages}`
    + `-resources-${progress.completedResources}-of-${progress.totalResources}`
  const entries: PackagedE2ePrototypeSuiteCheckpoint[] = [{
    key: `${progress.candidateId}:status:${progress.status}`,
    id: `prototype-suite-${ordinal}-${progress.status}-${counts}`,
    // This phase records that the bounded observation was persisted. A failed
    // candidate can later recover through Retry, so only the journey's terminal
    // failure phase may carry `failed` in standalone release evidence.
    status: 'passed',
  }]
  if (progress.status !== 'generating') return entries

  for (const [state, count] of [
    ['generating', progress.generatingPages],
    ['reviewing', progress.reviewingPages],
    ['retrying', progress.retryingPages],
    ['rejected', progress.rejectedPages],
  ] as const) {
    if (count === 0) continue
    entries.push({
      // Record the first observed count for each state. Keying every count
      // combination would let a long concurrent run exhaust the native phase
      // budget even though no new lifecycle state had appeared.
      key: `${progress.candidateId}:activity:${state}`,
      id: `prototype-suite-${ordinal}-activity-${state}-${count}`,
      status: 'passed',
    })
  }

  for (const [label, completed] of progressMilestones(
    progress.completedPages,
    progress.totalPages,
    true,
  )) {
    entries.push({
      key: `${progress.candidateId}:pages:${label}`,
      id: `prototype-suite-${ordinal}-generating-pages-${label}-${completed}-of-${progress.totalPages}`
        + `-resources-${progress.completedResources}-of-${progress.totalResources}`,
      status: 'passed',
    })
  }
  for (const [label, completed] of progressMilestones(
    progress.completedResources,
    progress.totalResources,
    false,
  )) {
    entries.push({
      key: `${progress.candidateId}:resources:${label}`,
      id: `prototype-suite-${ordinal}-generating-pages-${progress.completedPages}-of-${progress.totalPages}`
        + `-resources-${label}-${completed}-of-${progress.totalResources}`,
      status: 'passed',
    })
  }
  return entries
}

async function checkpointPrototypeSuiteStages(): Promise<void> {
  const progress = readWorkspacePrototypeSuiteProgress(
    document.querySelector<HTMLElement>('[data-workspace-root]'),
  )
  for (const suite of progress) {
    for (const checkpoint of prototypeSuiteProgressCheckpointEntries(suite)) {
      if (prototypeSuiteCheckpoints.has(checkpoint.key)) continue
      prototypeSuiteCheckpoints.add(checkpoint.key)
      await invoke('packaged_e2e_checkpoint', {
        phases: [{ id: checkpoint.id, status: checkpoint.status }],
      })
    }
  }
}

async function checkpointDesignCandidateStages(): Promise<void> {
  const progress = readWorkspaceDesignCandidateProgress(
    document.querySelector<HTMLElement>('[data-workspace-root]'),
  )
  for (const candidate of progress) {
    if (candidate.status === 'proposed') continue
    const ordinal = candidate.candidateId.slice('design-'.length)
    const checkpoint = candidate.status === 'generating'
      ? candidate.ownerStage
      : candidate.status
    const id = `design-candidate-${ordinal}-${checkpoint}`
    if (designCandidateCheckpoints.has(id)) continue
    designCandidateCheckpoints.add(id)
    await invoke('packaged_e2e_checkpoint', {
      phases: [{
        id,
        // Candidate states are observations, not terminal journey verdicts.
        // Preserve the observed state in the id and reserve `failed` for the
        // top-level failure phase so a successful Retry remains valid evidence.
        status: 'passed',
      }],
    })
  }
}

async function checkpointPipelineStage(): Promise<void> {
  const stages = readWorkspacePipelineStages(
    document.querySelector<HTMLElement>('[data-workspace-root]'),
  )
  for (const stage of stages) {
    if (pipelineCheckpoints.has(stage)) continue
    pipelineCheckpoints.add(stage)
    await invoke('packaged_e2e_checkpoint', {
      phases: [{ id: `pipeline-stage-${stage}`, status: 'passed' }],
    })
  }
}

async function checkpointPlannerStage(): Promise<void> {
  const workspace = document.querySelector<HTMLElement>('[data-workspace-root]')
  const history = readWorkspacePlannerProgressHistory(
    workspace,
  )
  const attempt = readWorkspacePlannerAttempt(workspace)
  if (attempt === undefined) return
  for (const progress of history) {
    const id = plannerProgressCheckpointId(progress, attempt)
    const fingerprint = `${progress.completedPages}/${progress.totalPages}`
    if (plannerCheckpoints.get(id) === fingerprint) continue
    plannerCheckpoints.set(id, fingerprint)
    await invoke('packaged_e2e_checkpoint', {
      phases: [{ id, status: 'passed' }],
    })
  }
}

export function plannerProgressCheckpointId(
  progress: PackagedE2ePlannerProgress,
  attempt: number,
): string {
  if (
    !Number.isSafeInteger(attempt)
    || attempt < 1
    || attempt > PACKAGED_E2E_MAX_RUN_RETRIES + 1
  ) {
    throw new Error('packaged-e2e-planner-attempt-invalid')
  }
  return `planner-stage-${progress.stage}-attempt-${attempt}`
}

export function retryPendingRun(
  tracker: PackagedE2eRetryTracker = runRetryTracker,
): boolean {
  if (
    tracker.pendingAttempt !== null
    || tracker.totalAttempts >= PACKAGED_E2E_MAX_RUN_RETRIES
  ) return false
  const workspace = document.querySelector<HTMLElement>('[data-workspace-root]')
  if (workspace?.dataset.runFailed !== 'true') return false
  if (readWorkspaceFailureDiagnostic(workspace) === 'planner-progressive-graph') {
    return false
  }
  const frontier = retryFailureFrontier(workspace)
  const frontierAttempts = tracker.attemptsByFrontier.get(frontier) ?? 0
  if (frontierAttempts >= PACKAGED_E2E_MAX_RETRIES_PER_FAILURE_FRONTIER) return false
  const retry = document.querySelector<HTMLButtonElement>(
    '[data-slot="agent-decision-bubble"] [data-agent-action="retry-run"]:not(:disabled), '
      + '[data-slot="agent-run-feed"] [data-agent-action="retry-run"]:not(:disabled)',
  )
  if (!retry || !isVisibleControl(retry)) return false
  tracker.totalAttempts += 1
  tracker.pendingAttempt = tracker.totalAttempts
  tracker.attemptsByFrontier.set(frontier, frontierAttempts + 1)
  retry.click()
  return true
}

export function hasRetryRunStarted(
  workspace: HTMLElement,
  tracker: PackagedE2eRetryTracker = runRetryTracker,
): boolean {
  const pendingAttempt = tracker.pendingAttempt
  const started = (pendingAttempt !== null
    && numberData(workspace, 'packagedE2eRetryStartCount') >= pendingAttempt)
    || workspace.dataset.agentWorking === 'true'
    || workspace.dataset.runFailed !== 'true'
  if (started) tracker.pendingAttempt = null
  return started
}

export function retryFailureFrontier(workspace: HTMLElement): string {
  const failedSuites = readWorkspacePrototypeSuiteProgress(workspace)
    .filter(({ status }) => status === 'failed')
    .map((suite) => [
      suite.candidateId,
      `${suite.completedPages}/${suite.totalPages}`,
      `${suite.completedResources}/${suite.totalResources}`,
    ].join(':'))
    .sort()
  if (failedSuites.length > 0) return `suite:${failedSuites.join('|')}`

  const failedDesigns = readWorkspaceDesignCandidateProgress(workspace)
    .filter(({ status }) => status === 'failed')
    .map(({ candidateId }) => candidateId)
    .sort()
  if (failedDesigns.length > 0) return `design:${failedDesigns.join('|')}`

  const planner = readWorkspacePlannerProgress(workspace)
  return [
    'run',
    readWorkspaceFailureDiagnostic(workspace),
    planner ? `${planner.stage}:${planner.completedPages}/${planner.totalPages}` : 'no-planner',
  ].join(':')
}

async function yieldToUi(): Promise<void> {
  await invoke('packaged_e2e_tick')
}

export function approvePendingTools(): number {
  let approved = 0
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    '[data-slot="agent-decision-bubble"] [data-agent-action="approve-tool"]:not(:disabled), '
      + '[data-slot="execution-timeline"] [data-agent-action="approve-tool"]:not(:disabled), '
      + '[data-slot="agent-run-feed"] [data-agent-action="approve-tool"]:not(:disabled)',
  )) {
    if (!isVisibleControl(button)) continue
    button.click()
    approved += 1
  }
  return approved
}

function isVisibleControl(element: HTMLElement): boolean {
  if (!element.isConnected || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current)
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false
  }
  return element.getClientRects().length > 0
}

function agentMessageCount(): number {
  return document.querySelectorAll('[data-slot="agent-message"]').length
}

export function hasFreshAgentMessage(initialCount: number): boolean {
  return agentMessageCount() > initialCount
}

export function hasSettledFreshAgentResponse(
  workspace: HTMLElement,
  initialCount: number,
): boolean {
  return workspace.dataset.agentWorking === 'false'
    && hasFreshAgentMessage(initialCount)
}

function workspaceRoot(): HTMLElement {
  const workspace = document.querySelector<HTMLElement>('[data-workspace-root]')
  if (!workspace) throw new Error('packaged-e2e-workspace-unavailable')
  return workspace
}

function numberData(element: HTMLElement, key: keyof DOMStringMap): number {
  const value = Number(element.dataset[key])
  return Number.isFinite(value) ? value : -1
}

export function rejectFailedWorkspacePhase(workspace: HTMLElement, phase: PhaseId): void {
  // Error state can render one commit before the run's finally block clears
  // `agentWorking` and exposes Retry. Never let the harness terminate the app
  // while that real product transition is still settling.
  if (workspace.dataset.runFailed === 'true'
    && workspace.dataset.agentWorking === 'false') {
    throw new JourneyFailure(phase, 'run-failed')
  }
  if (phase === 'design-candidates-ready'
    && numberData(workspace, 'designCandidateFailedCount') > 0
    && workspace.dataset.agentWorking === 'false') {
    throw new JourneyFailure(phase, 'candidate-failed')
  }
  if (phase === 'prototype-suite-ready'
    && numberData(workspace, 'prototypeSuiteFailedCount') > 0
    && workspace.dataset.agentWorking === 'false') {
    throw new JourneyFailure(phase, 'suite-failed')
  }
}

function setTextareaValue(element: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  if (!setter) throw new Error('packaged-e2e-textarea-unavailable')
  setter.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}
