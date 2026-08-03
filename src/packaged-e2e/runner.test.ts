import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  JourneyFailure,
  PACKAGED_E2E_ALL_SUITES_TIMEOUT_MS,
  PACKAGED_E2E_CASUAL_PROMPT,
  PACKAGED_E2E_MAX_RETRIES_PER_FAILURE_FRONTIER,
  PACKAGED_E2E_MAX_RUN_RETRIES,
  PACKAGED_E2E_PER_SUITE_TIMEOUT_MS,
  PACKAGED_E2E_PROTOTYPE_SUITE_COUNT,
  approvePendingTools,
  collectPackagedE2eOutcome,
  createPackagedE2eRetryTracker,
  hasCompleteDeliveryEvidence,
  hasRetryRunStarted,
  hasFreshAgentMessage,
  hasSettledFreshAgentResponse,
  hasVisibleDialog,
  monotonicDeadline,
  readWorkspaceFailureDiagnostic,
  readWorkspacePipelineStage,
  readWorkspacePipelineStages,
  readWorkspaceDesignCandidateProgress,
  readWorkspacePlannerProgress,
  readWorkspacePlannerProgressHistory,
  readWorkspacePrototypeSuiteProgress,
  readWorkspaceSelectedSuiteId,
  rejectFailedWorkspacePhase,
  retryFailureFrontier,
  retryPendingRun,
  prototypeSuiteProgressCheckpointEntries,
} from './runner'

afterEach(() => {
  document.body.replaceChildren()
})

function makeVisible(element: HTMLElement): void {
  element.getClientRects = () => ({ length: 1 }) as DOMRectList
}

function completeOutcomeWorkspace(): HTMLElement {
  const workspace = document.createElement('div')
  const routeCounts = [4, 5, 7] as const
  const resourceCounts = [7, 11, 19] as const
  workspace.dataset.packagedE2eDesignCandidates = JSON.stringify(
    Array.from({ length: 3 }, (_, index) => ({
      candidateId: `design-${index + 1}`,
      status: 'ready',
    })),
  )
  const digest = 'a'.repeat(64)
  workspace.dataset.packagedE2eDeliveryEvidence = JSON.stringify(
    routeCounts.map((routeCount, suiteIndex) => ({
      candidateId: `suite-${suiteIndex + 1}`,
      designSystemId: `design-${suiteIndex + 1}`,
      resourcePackId: `resource-pack-${suiteIndex + 1}`,
      status: 'ready',
      routes: Array.from(
        { length: routeCount },
        (_, routeIndex) => `/suite-${suiteIndex + 1}/route-${routeIndex + 1}`,
      ),
      routeCount,
      pageCount: routeCount,
      resourceAssetCount: resourceCounts[suiteIndex],
      artifactCount: resourceCounts[suiteIndex],
      qualityReviewStatus: 'passed',
      digests: {
        designSystemImage: digest,
        designMarkdown: digest,
        cssVariables: digest,
        tailwindTheme: digest,
        tokensJson: digest,
        designIrTokens: digest,
        routeGraph: digest,
        pageMedia: digest,
        manifest: digest,
        bindings: digest,
        resourcePack: digest,
        resourceArtifacts: digest,
        provenance: digest,
        reviewDocument: digest,
        pageReviews: digest,
        resourceReviews: digest,
      },
    })),
  )
  workspace.dataset.packagedE2eSelectedSuiteId = 'suite-2'
  workspace.dataset.packagedE2eVisibleSliceCount = '11'
  workspace.dataset.packagedE2ePlannedImageCallCount = '23'
  workspace.dataset.packagedE2eImageCallCount = '23'
  return workspace
}

describe('packaged E2E provider-response boundary', () => {
  it('treats an exit-transition dialog as closed once it is no longer visible', () => {
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.append(dialog)
    expect(hasVisibleDialog()).toBe(false)

    makeVisible(dialog)
    expect(hasVisibleDialog()).toBe(true)
    dialog.hidden = true
    expect(hasVisibleDialog()).toBe(false)
  })

  it('budgets the complete three-suite workload without weakening per-suite bounds', () => {
    expect(PACKAGED_E2E_PROTOTYPE_SUITE_COUNT).toBe(3)
    expect(PACKAGED_E2E_PER_SUITE_TIMEOUT_MS).toBe(45 * 60_000)
    expect(PACKAGED_E2E_ALL_SUITES_TIMEOUT_MS).toBe(3 * 45 * 60_000)
  })

  it('keeps journey deadlines independent from wall-clock jumps', () => {
    let monotonicTime = 100
    const expired = monotonicDeadline(1_000, () => monotonicTime)
    const wallClock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 8 * 60 * 60_000)
    expect(expired()).toBe(false)
    monotonicTime = 1_100
    expect(expired()).toBe(true)
    wallClock.mockRestore()
  })

  it('makes the first turn explicitly conversational only', () => {
    expect(PACKAGED_E2E_CASUAL_PROMPT).toContain('只进行对话和需求梳理')
    expect(PACKAGED_E2E_CASUAL_PROMPT).toContain('不要生成设计、原型或素材')
  })

  it('requires an Agent message newer than the pre-submit transcript', () => {
    document.body.innerHTML = '<div data-slot="agent-message">Earlier reply</div>'
    expect(hasFreshAgentMessage(1)).toBe(false)

    document.body.insertAdjacentHTML('beforeend', '<div data-slot="agent-message">New reply</div>')
    expect(hasFreshAgentMessage(1)).toBe(true)
  })

  it('waits for the conversational run to settle before submitting the creative brief', () => {
    document.body.innerHTML = '<div data-slot="agent-message">New reply</div>'
    const workspace = document.createElement('div')
    workspace.dataset.agentWorking = 'true'
    expect(hasSettledFreshAgentResponse(workspace, 0)).toBe(false)

    workspace.dataset.agentWorking = 'false'
    expect(hasSettledFreshAgentResponse(workspace, 0)).toBe(true)
  })

  it('auto-approves visible controls on every reviewed Agent approval surface', () => {
    document.body.innerHTML = [
      '<div data-slot="agent-decision-bubble"><button data-agent-action="approve-tool">Approve</button></div>',
      '<div data-slot="execution-timeline"><button data-agent-action="approve-tool">Approve timeline</button></div>',
      '<div data-slot="agent-run-feed"><button data-agent-action="approve-tool">Approve feed tool</button></div>',
      '<div data-slot="agent-decision-bubble" hidden><button data-agent-action="approve-tool">Hidden</button></div>',
      '<button data-agent-action="approve-tool">Unbounded</button>',
    ].join('')
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')]
    const clicks = buttons.map(() => vi.fn())
    buttons.forEach((button, index) => {
      makeVisible(button)
      button.addEventListener('click', clicks[index])
    })

    expect(approvePendingTools()).toBe(3)
    expect(clicks[0]).toHaveBeenCalledOnce()
    expect(clicks[1]).toHaveBeenCalledOnce()
    expect(clicks[2]).toHaveBeenCalledOnce()
    expect(clicks[3]).not.toHaveBeenCalled()
    expect(clicks[4]).not.toHaveBeenCalled()
  })

  it('rejects the sanitized workspace failure state promptly', () => {
    const workspace = document.createElement('div')
    workspace.dataset.runFailed = 'true'
    workspace.dataset.agentWorking = 'false'

    try {
      rejectFailedWorkspacePhase(workspace, 'provider-response')
      throw new Error('expected provider response failure')
    } catch (error) {
      expect(error).toBeInstanceOf(JourneyFailure)
      expect(error).toMatchObject({ phase: 'provider-response', code: 'run-failed' })
    }
  })

  it('does not terminate while a failed run is still settling its Retry UI', () => {
    const workspace = document.createElement('div')
    workspace.dataset.runFailed = 'true'
    workspace.dataset.agentWorking = 'true'

    expect(() => rejectFailedWorkspacePhase(workspace, 'design-candidates-ready')).not.toThrow()
  })

  it('waits for product acknowledgement before retrying the same failure frontier', () => {
    document.body.innerHTML = [
      '<div data-workspace-root data-run-failed="true"></div>',
      '<div data-slot="agent-run-feed"><button data-agent-action="retry-run">Retry</button></div>',
    ].join('')
    const retry = document.querySelector<HTMLButtonElement>('button')!
    makeVisible(retry)
    const click = vi.fn()
    retry.addEventListener('click', click)
    const tracker = createPackagedE2eRetryTracker()

    expect(retryPendingRun(tracker)).toBe(true)
    expect(click).toHaveBeenCalledOnce()
    expect(retryPendingRun(tracker)).toBe(false)
    const workspace = document.querySelector<HTMLElement>('[data-workspace-root]')!
    workspace.dataset.packagedE2eRetryStartCount = '1'
    expect(hasRetryRunStarted(workspace, tracker)).toBe(true)
    expect(tracker.pendingAttempt).toBeNull()
  })

  it('allows a later suite failure to recover without an unbounded retry loop', () => {
    document.body.innerHTML = [
      '<div data-workspace-root data-run-failed="true"></div>',
      '<div data-slot="agent-run-feed"><button data-agent-action="retry-run">Retry</button></div>',
    ].join('')
    const workspace = document.querySelector<HTMLElement>('[data-workspace-root]')!
    const retry = document.querySelector<HTMLButtonElement>('button')!
    makeVisible(retry)
    const click = vi.fn()
    retry.addEventListener('click', click)
    const tracker = createPackagedE2eRetryTracker()
    const progress = (candidateId: string, completedPages: number) => JSON.stringify([
      {
        candidateId,
        status: 'failed',
        completedPages,
        totalPages: 6,
        completedResources: 0,
        totalResources: 8,
      },
    ])

    workspace.dataset.packagedE2ePrototypeSuiteProgress = progress('suite-2', 4)
    expect(retryFailureFrontier(workspace)).toBe('suite:suite-2:4/6:0/8')
    expect(retryPendingRun(tracker)).toBe(true)
    workspace.dataset.packagedE2eRetryStartCount = '1'
    expect(hasRetryRunStarted(workspace, tracker)).toBe(true)

    workspace.dataset.packagedE2ePrototypeSuiteProgress = progress('suite-3', 3)
    expect(retryFailureFrontier(workspace)).toBe('suite:suite-3:3/6:0/8')
    expect(retryPendingRun(tracker)).toBe(true)
    workspace.dataset.packagedE2eRetryStartCount = '2'
    expect(hasRetryRunStarted(workspace, tracker)).toBe(true)
    expect(click).toHaveBeenCalledTimes(2)
    expect(tracker.totalAttempts).toBe(2)
  })

  it('bounds retries per failure frontier and across the complete journey', () => {
    expect(PACKAGED_E2E_MAX_RETRIES_PER_FAILURE_FRONTIER).toBe(2)
    expect(PACKAGED_E2E_MAX_RUN_RETRIES).toBe(6)

    document.body.innerHTML = [
      '<div data-workspace-root data-run-failed="true"></div>',
      '<div data-slot="agent-run-feed"><button data-agent-action="retry-run">Retry</button></div>',
    ].join('')
    const workspace = document.querySelector<HTMLElement>('[data-workspace-root]')!
    workspace.dataset.packagedE2ePrototypeSuiteProgress = JSON.stringify([{
      candidateId: 'suite-1',
      status: 'failed',
      completedPages: 1,
      totalPages: 4,
      completedResources: 0,
      totalResources: 7,
    }])
    const retry = document.querySelector<HTMLButtonElement>('button')!
    makeVisible(retry)
    const tracker = createPackagedE2eRetryTracker()

    for (let attempt = 1; attempt <= PACKAGED_E2E_MAX_RETRIES_PER_FAILURE_FRONTIER; attempt += 1) {
      expect(retryPendingRun(tracker)).toBe(true)
      workspace.dataset.packagedE2eRetryStartCount = String(attempt)
      expect(hasRetryRunStarted(workspace, tracker)).toBe(true)
    }
    expect(retryPendingRun(tracker)).toBe(false)

    tracker.totalAttempts = PACKAGED_E2E_MAX_RUN_RETRIES
    workspace.dataset.packagedE2ePrototypeSuiteProgress = JSON.stringify([{
      candidateId: 'suite-2',
      status: 'failed',
      completedPages: 2,
      totalPages: 5,
      completedResources: 0,
      totalResources: 9,
    }])
    expect(retryPendingRun(tracker)).toBe(false)
  })

  it('does not evaluate the stale failed snapshot until Retry starts', () => {
    const workspace = document.createElement('div')
    workspace.dataset.runFailed = 'true'
    workspace.dataset.agentWorking = 'false'
    const tracker = createPackagedE2eRetryTracker()
    tracker.totalAttempts = 1
    tracker.pendingAttempt = 1
    expect(hasRetryRunStarted(workspace, tracker)).toBe(false)

    workspace.dataset.agentWorking = 'true'
    expect(hasRetryRunStarted(workspace, tracker)).toBe(true)

    tracker.pendingAttempt = 1
    workspace.dataset.agentWorking = 'false'
    workspace.dataset.runFailed = 'false'
    expect(hasRetryRunStarted(workspace, tracker)).toBe(true)
  })

  it('acknowledges the product Retry attempt before asynchronous preflight settles', () => {
    const workspace = document.createElement('div')
    workspace.dataset.runFailed = 'true'
    workspace.dataset.agentWorking = 'false'
    workspace.dataset.packagedE2eRetryStartCount = '1'
    const tracker = createPackagedE2eRetryTracker()
    tracker.totalAttempts = 1
    tracker.pendingAttempt = 1

    expect(hasRetryRunStarted(workspace, tracker)).toBe(true)
  })
})

describe('packaged E2E failure diagnostics', () => {
  it('accepts only the closed credential-free diagnostic vocabulary', () => {
    const workspace = document.createElement('div')
    const diagnostics = [
      'planner-structured-contract',
      'planner-progressive-outline',
      'planner-progressive-design-foundation',
      'planner-progressive-design-exploration',
      'planner-progressive-design-bounds',
      'planner-progressive-page',
      'planner-progressive-page-identity',
      'planner-progressive-closure',
      'planner-progressive-merge',
      'planner-progressive-graph',
      'planner-progressive-coverage',
      'provider-auth',
      'provider-transport',
      'provider-output',
      'board-decode',
      'board-composition',
      'board-zero-slices',
      'board-slot-assignment',
      'artifact-persistence',
      'generation-candidate',
      'orchestration-state',
    ] as const

    for (const diagnostic of diagnostics) {
      workspace.dataset.packagedE2eRunDiagnostic = diagnostic
      expect(readWorkspaceFailureDiagnostic(workspace)).toBe(diagnostic)
    }
  })

  it('collapses raw secret-looking data, provider ids, URLs, and paths to unknown', () => {
    const workspace = document.createElement('div')
    for (const untrusted of [
      'Bearer sk-secret',
      'provider:private-account',
      'https://example.test/v1/models',
      '/Users/example/.config/secret.json',
    ]) {
      workspace.dataset.packagedE2eRunDiagnostic = untrusted
      const diagnostic = readWorkspaceFailureDiagnostic(workspace)
      expect(diagnostic).toBe('unknown')
      expect(JSON.stringify({ diagnostic })).not.toContain(untrusted)
    }
    expect(readWorkspaceFailureDiagnostic(null)).toBe('unknown')
  })

  it('reads only bounded credential-free planner progress', () => {
    const workspace = document.createElement('div')
    workspace.dataset.packagedE2ePlannerStage = 'page'
    workspace.dataset.packagedE2ePlannerCompletedPages = '3'
    workspace.dataset.packagedE2ePlannerTotalPages = '6'
    expect(readWorkspacePlannerProgress(workspace)).toEqual({
      stage: 'page', completedPages: 3, totalPages: 6,
    })

    workspace.dataset.packagedE2ePlannerCompletedPages = '7'
    expect(readWorkspacePlannerProgress(workspace)).toBeUndefined()
    workspace.dataset.packagedE2ePlannerCompletedPages = '3'
    workspace.dataset.packagedE2ePlannerStage = 'provider:private-account'
    expect(readWorkspacePlannerProgress(workspace)).toBeUndefined()
  })

  it('reads only closed credential-free pipeline stages', () => {
    const workspace = document.createElement('div')
    for (const stage of [
      'tool-gate',
      'image-route-catalogued',
      'image-execution-started',
      'image-execution-proven',
      'research-brief',
      'planner',
    ]) {
      workspace.dataset.packagedE2ePipelineStage = stage
      expect(readWorkspacePipelineStage(workspace)).toBe(stage)
    }

    workspace.dataset.packagedE2ePipelineStage = 'provider:private-account'
    expect(readWorkspacePipelineStage(workspace)).toBeUndefined()
    expect(readWorkspacePipelineStage(null)).toBeUndefined()
  })

  it('retains every unseen closed pipeline and planner stage from cumulative state', () => {
    const workspace = document.createElement('div')
    workspace.dataset.packagedE2ePipelineStages = JSON.stringify([
      'tool-gate',
      'research-brief',
      'planner',
      'image-route-catalogued',
      'image-execution-started',
      'image-execution-proven',
    ])
    workspace.dataset.packagedE2ePlannerProgressHistory = JSON.stringify([
      { stage: 'outline', completedPages: 0, totalPages: 6 },
      { stage: 'page', completedPages: 6, totalPages: 6 },
      { stage: 'complete', completedPages: 6, totalPages: 6 },
    ])

    expect(readWorkspacePipelineStages(workspace)).toEqual([
      'tool-gate',
      'research-brief',
      'planner',
      'image-route-catalogued',
      'image-execution-started',
      'image-execution-proven',
    ])
    expect(readWorkspacePlannerProgressHistory(workspace).map(({ stage }) => stage)).toEqual([
      'outline',
      'page',
      'complete',
    ])
  })

  it('rejects duplicated or untrusted cumulative stage evidence', () => {
    const workspace = document.createElement('div')
    workspace.dataset.packagedE2ePipelineStages = JSON.stringify(['planner', 'planner'])
    workspace.dataset.packagedE2ePlannerProgressHistory = JSON.stringify([
      { stage: 'page', completedPages: 1, totalPages: 6 },
      { stage: 'provider:private-account', completedPages: 1, totalPages: 6 },
    ])
    expect(readWorkspacePipelineStages(workspace)).toEqual([])
    expect(readWorkspacePlannerProgressHistory(workspace)).toEqual([])
  })

  it('reads only closed credential-free Design System candidate progress', () => {
    const workspace = document.createElement('div')
    workspace.dataset.packagedE2eDesignCandidates = JSON.stringify([
      { candidateId: 'design-1', status: 'generating' },
      { candidateId: 'design-2', status: 'ready' },
      { candidateId: 'design-3', status: 'failed' },
    ])
    expect(readWorkspaceDesignCandidateProgress(workspace)).toEqual([
      { candidateId: 'design-1', status: 'generating' },
      { candidateId: 'design-2', status: 'ready' },
      { candidateId: 'design-3', status: 'failed' },
    ])

    workspace.dataset.packagedE2eDesignCandidates = JSON.stringify([
      { candidateId: 'provider:private-account', status: 'failed' },
    ])
    expect(readWorkspaceDesignCandidateProgress(workspace)).toEqual([])
  })

  it('reads bounded credential-free prototype suite page and resource progress', () => {
    const workspace = document.createElement('div')
    workspace.dataset.packagedE2ePrototypeSuiteProgress = JSON.stringify([
      {
        candidateId: 'suite-1',
        status: 'generating',
        completedPages: 3,
        totalPages: 6,
        completedResources: 0,
        totalResources: 13,
      },
      {
        candidateId: 'suite-2',
        status: 'ready',
        completedPages: 6,
        totalPages: 6,
        completedResources: 13,
        totalResources: 13,
      },
      {
        candidateId: 'suite-3',
        status: 'failed',
        completedPages: 1,
        totalPages: 6,
        completedResources: 0,
        totalResources: 13,
      },
    ])

    expect(readWorkspacePrototypeSuiteProgress(workspace)).toEqual([
      {
        candidateId: 'suite-1',
        status: 'generating',
        completedPages: 3,
        totalPages: 6,
        completedResources: 0,
        totalResources: 13,
      },
      {
        candidateId: 'suite-2',
        status: 'ready',
        completedPages: 6,
        totalPages: 6,
        completedResources: 13,
        totalResources: 13,
      },
      {
        candidateId: 'suite-3',
        status: 'failed',
        completedPages: 1,
        totalPages: 6,
        completedResources: 0,
        totalResources: 13,
      },
    ])
  })

  it('keeps product candidate identity separate from sanitized suite evidence', () => {
    const workspace = document.createElement('div')
    workspace.dataset.selectedPrototypeSuiteId = 'candidate:prototype-suite:private-runtime-id'
    workspace.dataset.packagedE2eSelectedSuiteId = 'suite-2'

    expect(readWorkspaceSelectedSuiteId(workspace)).toBe('suite-2')

    delete workspace.dataset.packagedE2eSelectedSuiteId
    expect(readWorkspaceSelectedSuiteId(workspace)).toBeUndefined()

    workspace.dataset.packagedE2eSelectedSuiteId = workspace.dataset.selectedPrototypeSuiteId
    expect(readWorkspaceSelectedSuiteId(workspace)).toBeUndefined()
  })

  it('rejects untrusted, duplicate, or internally inconsistent suite progress', () => {
    const workspace = document.createElement('div')
    const valid = {
      candidateId: 'suite-1',
      status: 'generating',
      completedPages: 3,
      totalPages: 6,
      completedResources: 4,
      totalResources: 13,
    }
    for (const invalid of [
      [{ ...valid, candidateId: 'provider:private-account' }],
      [valid, valid],
      [{ ...valid, completedPages: 7 }],
      [{ ...valid, totalResources: 4097 }],
      [{ ...valid, prompt: 'secret' }],
      [{ ...valid, status: 'ready' }],
    ]) {
      workspace.dataset.packagedE2ePrototypeSuiteProgress = JSON.stringify(invalid)
      expect(readWorkspacePrototypeSuiteProgress(workspace)).toEqual([])
    }
  })

  it('projects bounded cumulative suite checkpoints without per-resource phase growth', () => {
    const checkpoints = prototypeSuiteProgressCheckpointEntries({
      candidateId: 'suite-1',
      status: 'generating',
      completedPages: 6,
      totalPages: 6,
      completedResources: 7,
      totalResources: 13,
    })

    expect(checkpoints.map(({ id }) => id)).toEqual([
      'prototype-suite-1-generating-pages-6-of-6-resources-7-of-13',
      'prototype-suite-1-generating-pages-first-1-of-6-resources-7-of-13',
      'prototype-suite-1-generating-pages-half-3-of-6-resources-7-of-13',
      'prototype-suite-1-generating-pages-complete-6-of-6-resources-7-of-13',
      'prototype-suite-1-generating-pages-6-of-6-resources-first-1-of-13',
      'prototype-suite-1-generating-pages-6-of-6-resources-half-7-of-13',
    ])
    expect(checkpoints).toHaveLength(6)
    expect(checkpoints.every(({ id }) => id.length <= 80 && /^[a-z0-9-]+$/.test(id))).toBe(true)
    expect(JSON.stringify(checkpoints)).not.toMatch(/provider|credential|prompt|path/i)

    expect(prototypeSuiteProgressCheckpointEntries({
      candidateId: 'suite-1',
      status: 'ready',
      completedPages: 6,
      totalPages: 6,
      completedResources: 13,
      totalResources: 13,
    })).toEqual([{
      key: 'suite-1:status:ready',
      id: 'prototype-suite-1-ready-pages-6-of-6-resources-13-of-13',
      status: 'passed',
    }])
  })
})

describe('packaged E2E outcome evidence', () => {
  it('waits for asynchronous delivery evidence instead of treating ready counts as proof', () => {
    const workspace = completeOutcomeWorkspace()
    workspace.dataset.prototypeSuiteCount = '3'
    const evidence = workspace.dataset.packagedE2eDeliveryEvidence
    delete workspace.dataset.packagedE2eDeliveryEvidence
    expect(hasCompleteDeliveryEvidence(workspace)).toBe(false)
    workspace.dataset.packagedE2eDeliveryEvidence = evidence
    expect(hasCompleteDeliveryEvidence(workspace)).toBe(true)
  })

  it('collects only bounded quantities and opaque identities for the completed graph', () => {
    const outcome = collectPackagedE2eOutcome(completeOutcomeWorkspace())

    expect(outcome.designSystems).toEqual([
      { candidateId: 'design-1', status: 'ready' },
      { candidateId: 'design-2', status: 'ready' },
      { candidateId: 'design-3', status: 'ready' },
    ])
    expect(outcome.prototypeSuites).toHaveLength(3)
    expect(outcome.prototypeSuites.map((suite) => suite.designSystemId)).toEqual([
      'design-1',
      'design-2',
      'design-3',
    ])
    expect(outcome.prototypeSuites.map((suite) => suite.routes.length)).toEqual([4, 5, 7])
    expect(outcome.prototypeSuites.map((suite) => suite.resourceAssetCount)).toEqual([7, 11, 19])
    expect(outcome).toMatchObject({
      selectedSuiteId: 'suite-2',
      selectedVisibleSliceCount: 11,
      plannedImageCallCount: 23,
      imageCallCount: 23,
    })
    expect(outcome).not.toHaveProperty('coding')
    expect(JSON.stringify(outcome)).not.toMatch(/prompt|provider|credential|localPath/i)
  })

  it('rejects hidden paid-image amplification beyond the benchmark DAG', () => {
    const workspace = completeOutcomeWorkspace()
    workspace.dataset.packagedE2eImageCallCount = '24'
    expect(() => collectPackagedE2eOutcome(workspace)).toThrow(JourneyFailure)
  })

  it('rejects an actual call count that differs from the compiled material plan', () => {
    const workspace = completeOutcomeWorkspace()
    workspace.dataset.packagedE2ePlannedImageCallCount = '22'
    expect(() => collectPackagedE2eOutcome(workspace)).toThrow(JourneyFailure)
  })

  it('rejects duplicate route graphs and incomplete resource quantities', () => {
    const duplicate = completeOutcomeWorkspace()
    const suites = JSON.parse(duplicate.dataset.packagedE2eDeliveryEvidence!) as Array<{
      routes: string[]
      resourceAssetCount: number
    }>
    suites[2]!.routes = [...suites[0]!.routes]
    duplicate.dataset.packagedE2eDeliveryEvidence = JSON.stringify(suites)
    expect(() => collectPackagedE2eOutcome(duplicate)).toThrow(JourneyFailure)

    const incomplete = completeOutcomeWorkspace()
    const incompleteSuites = JSON.parse(
      incomplete.dataset.packagedE2eDeliveryEvidence!,
    ) as Array<{ resourceAssetCount: number }>
    incompleteSuites[1]!.resourceAssetCount = 0
    incomplete.dataset.packagedE2eDeliveryEvidence = JSON.stringify(incompleteSuites)
    expect(() => collectPackagedE2eOutcome(incomplete)).toThrow(JourneyFailure)
  })

  it('rejects prototype suites that do not bind one-to-one to ready Design Systems', () => {
    const workspace = completeOutcomeWorkspace()
    const suites = JSON.parse(workspace.dataset.packagedE2eDeliveryEvidence!) as Array<{
      designSystemId: string
    }>
    suites[2]!.designSystemId = suites[0]!.designSystemId
    workspace.dataset.packagedE2eDeliveryEvidence = JSON.stringify(suites)

    expect(() => collectPackagedE2eOutcome(workspace)).toThrow(JourneyFailure)
  })

  it('rejects duplicate resource-pack identities and malformed digests', () => {
    const duplicate = completeOutcomeWorkspace()
    const duplicateSuites = JSON.parse(duplicate.dataset.packagedE2eDeliveryEvidence!) as Array<{
      resourcePackId: string
    }>
    duplicateSuites[2]!.resourcePackId = duplicateSuites[0]!.resourcePackId
    duplicate.dataset.packagedE2eDeliveryEvidence = JSON.stringify(duplicateSuites)
    expect(() => collectPackagedE2eOutcome(duplicate)).toThrow(JourneyFailure)

    for (const digest of ['A'.repeat(64), 'g'.repeat(64), 'a'.repeat(63)]) {
      const workspace = completeOutcomeWorkspace()
      const suites = JSON.parse(workspace.dataset.packagedE2eDeliveryEvidence!) as Array<{
        digests: { designSystemImage: string }
      }>
      suites[0]!.digests.designSystemImage = digest
      workspace.dataset.packagedE2eDeliveryEvidence = JSON.stringify(suites)
      expect(() => collectPackagedE2eOutcome(workspace)).toThrow(JourneyFailure)
    }
  })

  it('rejects a visible consumable count that differs from selected production authority', () => {
    const slices = completeOutcomeWorkspace()
    slices.dataset.packagedE2eVisibleSliceCount = '47'
    expect(() => collectPackagedE2eOutcome(slices)).toThrow(JourneyFailure)
  })

  it('rejects non-opaque ids, unbounded routes, and extra payload fields', () => {
    const workspace = completeOutcomeWorkspace()
    const designs = JSON.parse(workspace.dataset.packagedE2eDesignCandidates!) as Array<
      Record<string, unknown>
    >
    designs[0] = { ...designs[0], candidateId: 'candidate:generated-title', prompt: 'secret' }
    workspace.dataset.packagedE2eDesignCandidates = JSON.stringify(designs)

    expect(() => collectPackagedE2eOutcome(workspace)).toThrow(JourneyFailure)
  })

  it('rejects missing review, token, provenance, binding, or pack digests', () => {
    for (const key of [
      'reviewDocument',
      'designIrTokens',
      'provenance',
      'bindings',
      'resourcePack',
      'resourceArtifacts',
      'pageReviews',
      'resourceReviews',
    ]) {
      const workspace = completeOutcomeWorkspace()
      const suites = JSON.parse(workspace.dataset.packagedE2eDeliveryEvidence!) as Array<{
        digests: Record<string, string>
      }>
      delete suites[0]!.digests[key]
      workspace.dataset.packagedE2eDeliveryEvidence = JSON.stringify(suites)
      expect(() => collectPackagedE2eOutcome(workspace)).toThrow(JourneyFailure)
    }
  })
})
