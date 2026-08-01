import { invoke } from '@tauri-apps/api/core'

type PhaseId =
  | 'bootstrap'
  | 'settings-opened'
  | 'ai-configured'
  | 'settings-closed'
  | 'home-ready'
  | 'casual-chat-submitted'
  | 'provider-response'
  | 'creative-brief-submitted'
  | 'run-retried'
  | 'design-candidates-ready'
  | 'design-candidate-selected'
  | 'prototype-suite-ready'
  | 'prototype-suite-selected'
  | 'resource-pack-ready'

interface Phase {
  readonly id: PhaseId
  readonly status: 'passed' | 'failed' | 'skipped'
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
  readonly qualityReviewStatus: 'recorded'
  readonly digests: PackagedE2eDeliveryDigests
}

export interface PackagedE2eDeliveryDigests {
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
}

export interface PackagedE2eOutcome {
  readonly designSystems: readonly PackagedE2eCandidateOutcome[]
  readonly prototypeSuites: readonly PackagedE2eSuiteOutcome[]
  readonly selectedSuiteId: string
  readonly selectedVisibleSliceCount: number
  readonly plannedImageCallCount: number
  readonly imageCallCount: number
}

export type PackagedE2eFailureDiagnostic =
  | 'planner-structured-contract'
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
  | 'provider-transport'
  | 'provider-output'
  | 'board-decode'
  | 'board-composition'
  | 'board-zero-slices'
  | 'board-slot-assignment'
  | 'artifact-persistence'
  | 'generation-candidate'
  | 'orchestration-state'
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

export interface PackagedE2eDesignCandidateProgress {
  readonly candidateId: `design-${1 | 2 | 3}`
  readonly status: 'proposed' | 'generating' | 'ready' | 'failed' | 'cancelled'
}

export interface PackagedE2ePrototypeSuiteProgress {
  readonly candidateId: `suite-${1 | 2 | 3}`
  readonly status: 'proposed' | 'generating' | 'ready' | 'failed' | 'cancelled'
  readonly completedPages: number
  readonly totalPages: number
  readonly completedResources: number
  readonly totalResources: number
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
const plannerCheckpoints = new Set<string>()
const pipelineCheckpoints = new Set<string>()
const designCandidateCheckpoints = new Set<string>()
const prototypeSuiteCheckpoints = new Set<string>()

export const PACKAGED_E2E_CASUAL_PROMPT =
  '最近我总觉得整理旅行灵感很麻烦。想做一个安静但有探索感的旅行计划工具。这一步只进行对话和需求梳理，请先和我聊聊应该从什么体验开始，不要生成设计、原型或素材。'

export const PACKAGED_E2E_PROTOTYPE_SUITE_COUNT = 3
export const PACKAGED_E2E_PER_SUITE_TIMEOUT_MS = 45 * 60_000
export const PACKAGED_E2E_ALL_SUITES_TIMEOUT_MS =
  PACKAGED_E2E_PROTOTYPE_SUITE_COUNT * PACKAGED_E2E_PER_SUITE_TIMEOUT_MS
export const PACKAGED_E2E_MAX_RETRIES_PER_FAILURE_FRONTIER = 2
export const PACKAGED_E2E_MAX_RUN_RETRIES = PACKAGED_E2E_PROTOTYPE_SUITE_COUNT * 2

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

export async function runPackagedE2e(): Promise<void> {
  try {
    await pass('bootstrap')
    await waitFor(() => document.querySelector('#root')?.childElementCount)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', metaKey: true, bubbles: true }))
    const dialog = await waitFor(() => document.querySelector<HTMLElement>('[role="dialog"]'))
    await pass('settings-opened')
    const aiSection = dialog.querySelector<HTMLButtonElement>('[data-settings-section="ai"]')
    if (!aiSection) throw new JourneyFailure('settings-opened')
    aiSection.click()
    let capabilityGapSince: number | undefined
    let terminalSetupGapSince: number | undefined
    await waitFor(() => {
      const setup = document.querySelector<HTMLElement>('[data-ai-setup-status]')
      const status = setup?.dataset.aiSetupStatus
      if (status === 'unavailable' || status === 'needs-provider') {
        terminalSetupGapSince ??= performance.now()
        if (performance.now() - terminalSetupGapSince > 10_000) {
          throw new JourneyFailure(
            'ai-configured',
            status === 'needs-provider' ? 'capability-missing' : 'run-failed',
          )
        }
      } else {
        terminalSetupGapSince = undefined
      }
      if (status === 'needs-capabilities' && setup?.dataset.aiAutomaticBusy !== 'true') {
        capabilityGapSince ??= performance.now()
        if (performance.now() - capabilityGapSince > 5_000) {
          throw new JourneyFailure('ai-configured', 'capability-missing')
        }
      } else {
        capabilityGapSince = undefined
      }
      return status === 'ready'
        && setup?.dataset.aiAutomaticBusy === 'false'
        && numberData(setup!, 'aiVerifiedProviderCount') > 0
    }, 180_000)
    // Catalog verification proves that routes are configured, not that an
    // image endpoint can successfully execute. That proof is checkpointed only
    // after a Design System image has completed.
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
      return hasSettledFreshAgentResponse(workspace, initialAgentMessageCount)
    }, 300_000)
    await pass('provider-response')

    const agentComposer = await waitFor(() =>
      document.querySelector<HTMLTextAreaElement>('[aria-label="Message the Agent"]'))
    setTextareaValue(
      agentComposer,
      [
        '请把这个想法做成可交付的旅行规划 Web App。',
        '先生成 3 套意义明确且彼此不同的 Design System 方向供我比较。',
        '请从旅行规划的业务场景、内容模型、关键用户旅程和 Web 平台最佳实践推导每套完整且可互相导航的路由拓扑；页面数量由你判断，不能只做 Landing Page，也不要为凑数添加通用页面。',
        '请逐页识别真正不可由代码高保真重建、且值得复用的非 UI 视觉素材；数量与生产方式由素材价值和页面场景决定，不要为凑数把普通 UI 容器当素材。页面完成后进入切片和资源生产。',
      ].join('\n'),
    )
    agentComposer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await waitFor(() => {
      const workspace = workspaceRoot()
      return workspace.dataset.agentWorking === 'true'
        || workspace.dataset.workflowPhase !== 'idle'
        || numberData(workspace, 'designCandidateCount') > 0
    })
    await pass('creative-brief-submitted')

    await waitForJourney(() => {
      const workspace = workspaceRoot()
      rejectFailedWorkspacePhase(workspace, 'design-candidates-ready')
      return numberData(workspace, 'designCandidateCount') === 3
        && numberData(workspace, 'designCandidateReadyCount') === 3
        && workspace.dataset.workflowPhase === 'design-system-selection'
    }, 45 * 60_000)
    await pass('design-candidates-ready')

    const select = await waitFor(() =>
      document.querySelector<HTMLButtonElement>('[data-design-candidate-action="select"]:not(:disabled)'))
    select.click()
    await pass('design-candidate-selected')

    await waitForJourney(() => {
      const workspace = workspaceRoot()
      rejectFailedWorkspacePhase(workspace, 'prototype-suite-ready')
      return numberData(workspace, 'prototypeSuiteCount') === 3
        && numberData(workspace, 'prototypeSuiteReadyCount') === 3
        && numberData(workspace, 'resourcePackCount') === 3
        && hasCompleteDeliveryEvidence(workspace)
        && workspace.dataset.agentWorking === 'false'
    }, PACKAGED_E2E_ALL_SUITES_TIMEOUT_MS)
    await pass('prototype-suite-ready')

    const compareSuites = await waitFor(() =>
      document.querySelector<HTMLButtonElement>('[data-agent-action="compare-prototype-suites"]:not(:disabled)'))
    compareSuites.click()
    const selectSuite = await waitFor(() =>
      document.querySelector<HTMLButtonElement>('[data-suite-candidate-action="select"]:not(:disabled)'))
    const selectedSuiteCandidateId = selectSuite.dataset.suiteCandidateId
    if (!selectedSuiteCandidateId) throw new JourneyFailure('prototype-suite-selected')
    selectSuite.click()
    await waitForJourney(
      () => workspaceRoot().dataset.selectedPrototypeSuiteId === selectedSuiteCandidateId,
      5 * 60_000,
    )
    const selectedSuiteId = await waitFor(() =>
      readWorkspaceSelectedSuiteId(workspaceRoot()))
    await pass('prototype-suite-selected')
    const suiteDialog = document.querySelector<HTMLElement>('[role="dialog"]')
    const closeSuiteDialog = suiteDialog?.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')
    if (!closeSuiteDialog) throw new JourneyFailure('prototype-suite-selected')
    closeSuiteDialog.click()
    await waitFor(() => !hasVisibleDialog())

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
    await complete('passed', undefined, collectPackagedE2eOutcome(workspaceRoot()))
  } catch (error) {
    const id = error instanceof JourneyFailure ? error.phase : nextPhase()
    const phaseIndex = phases.findIndex((phase) => phase.id === id)
    if (phaseIndex < 0) phases.push({ id, status: 'failed' })
    else phases[phaseIndex] = { id, status: 'failed' }
    const workspace = document.querySelector<HTMLElement>('[data-workspace-root]')
    const plannerProgress = readWorkspacePlannerProgress(workspace)
    await complete('failed', {
      phase: id,
      code: failureCode(error),
      diagnostic: readWorkspaceFailureDiagnostic(workspace),
      ...(plannerProgress ? { plannerProgress } : {}),
    })
  }
}

export class JourneyFailure extends Error {
  readonly phase: PhaseId
  readonly code: FailureCode

  constructor(phase: PhaseId, code: FailureCode = 'phase-rejected') {
    super(phase)
    this.phase = phase
    this.code = code
  }
}

async function pass(id: PhaseId): Promise<void> {
  phases.push({ id, status: 'passed' })
  await invoke('packaged_e2e_checkpoint', { phases })
}

function nextPhase(): PhaseId {
  return ([
    'bootstrap', 'settings-opened', 'ai-configured', 'settings-closed', 'home-ready',
    'casual-chat-submitted',
    'provider-response', 'creative-brief-submitted', 'design-candidates-ready',
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

export function readWorkspaceFailureDiagnostic(
  workspace: HTMLElement | null,
): PackagedE2eFailureDiagnostic {
  switch (workspace?.dataset.packagedE2eRunDiagnostic) {
    case 'planner-structured-contract':
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
    case 'provider-transport':
    case 'provider-output':
    case 'board-decode':
    case 'board-composition':
    case 'board-zero-slices':
    case 'board-slot-assignment':
    case 'artifact-persistence':
    case 'generation-candidate':
    case 'orchestration-state':
      return workspace.dataset.packagedE2eRunDiagnostic
    default:
      return 'unknown'
  }
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
    if (!Array.isArray(parsed) || parsed.length > 6) return []
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

export function collectPackagedE2eOutcome(workspace: HTMLElement): PackagedE2eOutcome {
  const designSystems = readCandidates(workspace, 'packagedE2eDesignCandidates', 'design')
  const prototypeSuites = readSuites(workspace)
  const designSystemIds = new Set(designSystems.map(({ candidateId }) => candidateId))
  const boundDesignSystemIds = new Set(prototypeSuites.map(({ designSystemId }) => designSystemId))
  const resourcePackIds = new Set(prototypeSuites.map(({ resourcePackId }) => resourcePackId))
  const routeGraphs = new Set(prototypeSuites.map((suite) => JSON.stringify(suite.routes)))
  if (
    routeGraphs.size !== 3
    || boundDesignSystemIds.size !== 3
    || resourcePackIds.size !== 3
    || ![...boundDesignSystemIds].every((id) => designSystemIds.has(id))
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
    selectedSuite.resourceAssetCount,
    selectedSuite.resourceAssetCount,
  )
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

  return {
    designSystems,
    prototypeSuites,
    selectedSuiteId,
    selectedVisibleSliceCount,
    plannedImageCallCount,
    imageCallCount,
  }
}

export function hasCompleteDeliveryEvidence(workspace: HTMLElement): boolean {
  try {
    return readSuites(workspace).length === numberData(workspace, 'prototypeSuiteCount')
  } catch {
    return false
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
  if (parsed.length !== 3) throw outcomeFailure()
  const candidates = parsed.map((value) => {
    if (!isRecord(value) || !hasOnlyKeys(value, ['candidateId', 'status'])) {
      throw outcomeFailure()
    }
    if (!isOpaqueCandidateId(value.candidateId, prefix) || value.status !== 'ready') {
      throw outcomeFailure()
    }
    return { candidateId: value.candidateId, status: 'ready' as const }
  })
  if (new Set(candidates.map(({ candidateId }) => candidateId)).size !== 3) {
    throw outcomeFailure()
  }
  return candidates
}

function readSuites(workspace: HTMLElement): readonly PackagedE2eSuiteOutcome[] {
  const parsed = readJsonArray(workspace, 'packagedE2eDeliveryEvidence', 32_768)
  if (parsed.length !== 3) throw outcomeFailure()
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
        'digests',
      ])
      || !isOpaqueCandidateId(value.candidateId, 'suite')
      || !isOpaqueCandidateId(value.designSystemId, 'design')
      || !isOpaqueResourcePackId(value.resourcePackId)
      || value.status !== 'ready'
      || value.qualityReviewStatus !== 'recorded'
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
      || value.resourceAssetCount < 1
      || value.resourceAssetCount > 4096
      || value.artifactCount !== value.resourceAssetCount
      || value.routeCount !== value.routes.length
      || value.pageCount !== value.routes.length
      || !value.routes.every(isBoundedRoute)
      || new Set(value.routes).size !== value.routes.length
      || !isDeliveryDigests(value.digests)
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
      qualityReviewStatus: 'recorded' as const,
      digests: value.digests,
    }
  })
  if (new Set(suites.map(({ candidateId }) => candidateId)).size !== 3) {
    throw outcomeFailure()
  }
  return suites
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
  return typeof value === 'string' && new RegExp(`^${prefix}-[1-3]$`).test(value)
}

function isOpaqueResourcePackId(value: unknown): value is string {
  return typeof value === 'string' && /^resource-pack-[1-3]$/.test(value)
}

function isDeliveryDigests(value: unknown): value is PackagedE2eDeliveryDigests {
  const keys = [
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
  ] as const
  return isRecord(value)
    && hasOnlyKeys(value, keys)
    && keys.every((key) => typeof value[key] === 'string' && /^[a-f0-9]{64}$/.test(value[key]))
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
  const deadlineExpired = monotonicDeadline(timeoutMs)
  while (!deadlineExpired()) {
    const value = read()
    if (value) return value as NonNullable<T>
    await yieldToUi()
  }
  throw new Error('packaged-e2e-timeout')
}

async function waitForJourney(read: () => boolean, timeoutMs: number): Promise<void> {
  const deadlineExpired = monotonicDeadline(timeoutMs)
  while (!deadlineExpired()) {
    await checkpointPipelineStage()
    await checkpointPlannerStage()
    await checkpointDesignCandidateStages()
    await checkpointPrototypeSuiteStages()
    if (retryPendingRun()) {
      await pass('run-retried')
      await waitFor(
        () => hasRetryRunStarted(workspaceRoot()),
        2 * 60_000,
      )
      continue
    }
    if (read()) return
    approvePendingTools()
    await yieldToUi()
  }
  throw new Error('packaged-e2e-journey-timeout')
}

export function monotonicDeadline(
  timeoutMs: number,
  now: () => number = () => performance.now(),
): () => boolean {
  const deadline = now() + timeoutMs
  return () => now() >= deadline
}

export function readWorkspaceDesignCandidateProgress(
  workspace: HTMLElement | null,
): readonly PackagedE2eDesignCandidateProgress[] {
  if (!workspace) return []
  const encoded = workspace.dataset.packagedE2eDesignCandidates
  if (!encoded || encoded.length > 2048) return []
  try {
    const parsed: unknown = JSON.parse(encoded)
    if (!Array.isArray(parsed) || parsed.length > 3) return []
    const progress: PackagedE2eDesignCandidateProgress[] = []
    for (const value of parsed) {
      if (
        !isRecord(value)
        || !hasOnlyKeys(value, ['candidateId', 'status'])
        || !isOpaqueCandidateId(value.candidateId, 'design')
        || !['proposed', 'generating', 'ready', 'failed', 'cancelled'].includes(
          typeof value.status === 'string' ? value.status : '',
        )
      ) return []
      progress.push({
        candidateId: value.candidateId as PackagedE2eDesignCandidateProgress['candidateId'],
        status: value.status as PackagedE2eDesignCandidateProgress['status'],
      })
    }
    return progress
  } catch {
    return []
  }
}

export function readWorkspacePrototypeSuiteProgress(
  workspace: HTMLElement | null,
): readonly PackagedE2ePrototypeSuiteProgress[] {
  if (!workspace) return []
  const encoded = workspace.dataset.packagedE2ePrototypeSuiteProgress
  if (!encoded || encoded.length > 4096) return []
  try {
    const parsed: unknown = JSON.parse(encoded)
    if (!Array.isArray(parsed) || parsed.length > 3) return []
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
        ])
        || !isOpaqueCandidateId(value.candidateId, 'suite')
        || !['proposed', 'generating', 'ready', 'failed', 'cancelled'].includes(
          typeof value.status === 'string' ? value.status : '',
        )
        || !isBoundedProgress(value.completedPages, value.totalPages, 12)
        || !isBoundedProgress(value.completedResources, value.totalResources, 4096)
      ) return []
      const item = {
        candidateId: value.candidateId as PackagedE2ePrototypeSuiteProgress['candidateId'],
        status: value.status as PackagedE2ePrototypeSuiteProgress['status'],
        completedPages: value.completedPages as number,
        totalPages: value.totalPages as number,
        completedResources: value.completedResources as number,
        totalResources: value.totalResources as number,
      }
      if (
        (item.status === 'proposed' && (
          item.completedPages !== 0
          || item.totalPages !== 0
          || item.completedResources !== 0
          || item.totalResources !== 0
        ))
        || (item.status === 'ready' && (
          item.totalPages === 0
          || item.completedPages !== item.totalPages
          || item.totalResources === 0
          || item.completedResources !== item.totalResources
        ))
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
    status: progress.status === 'failed' || progress.status === 'cancelled'
      ? 'failed'
      : 'passed',
  }]
  if (progress.status !== 'generating') return entries

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
    const id = `design-candidate-${ordinal}-${candidate.status}`
    if (designCandidateCheckpoints.has(id)) continue
    designCandidateCheckpoints.add(id)
    await invoke('packaged_e2e_checkpoint', {
      phases: [{
        id,
        status: candidate.status === 'failed' || candidate.status === 'cancelled'
          ? 'failed'
          : 'passed',
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
  const history = readWorkspacePlannerProgressHistory(
    document.querySelector<HTMLElement>('[data-workspace-root]'),
  )
  for (const progress of history) {
    if (plannerCheckpoints.has(progress.stage)) continue
    plannerCheckpoints.add(progress.stage)
    await invoke('packaged_e2e_checkpoint', {
      phases: [{ id: `planner-stage-${progress.stage}`, status: 'passed' }],
    })
  }
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
