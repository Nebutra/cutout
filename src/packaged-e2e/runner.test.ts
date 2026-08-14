import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  JourneyFailure,
  PACKAGED_E2E_ALL_SUITES_TIMEOUT_MS,
  PACKAGED_E2E_CASUAL_PROMPT,
  PACKAGED_E2E_CANDIDATE_OWNER_DEADLINES_MS,
  PACKAGED_E2E_CREATIVE_BRIEF,
  PACKAGED_E2E_MAX_CANDIDATE_COUNT,
  PACKAGED_E2E_MAX_DELIVERY_EVIDENCE_LENGTH,
  PACKAGED_E2E_MAX_RETRIES_PER_FAILURE_FRONTIER,
  PACKAGED_E2E_MAX_RUN_RETRIES,
  PACKAGED_E2E_RETRY_UI_GRACE_MS,
  PACKAGED_E2E_PER_SUITE_TIMEOUT_MS,
  approvePendingTools,
  cancelPackagedE2eActiveRun,
  collectPackagedE2eOutcome,
  createPackagedE2eCandidateOwnerWatch,
  createPackagedE2eCandidateOwnerDeadlineMonitor,
  observePackagedE2eCandidateOwnerDeadlines,
  cancelPackagedE2eCandidateOwnerDeadlines,
  createPackagedE2eRetryTracker,
  hasAttentionRequiredDeliveryEvidence,
  hasCompleteDeliveryEvidence,
  hasDeliveryEvidenceForEverySuite,
  hasRetryRunStarted,
  hasFreshAgentMessage,
  hasFreshCreativeSubmission,
  hasSettledFreshAgentResponse,
  hasVisibleDialog,
  monotonicDeadline,
  observePackagedE2eCandidateOwners,
  plannerProgressCheckpointId,
  packagedE2eSuiteTimeoutMs,
  PACKAGED_E2E_SUITE_SETTLEMENT_GRACE_MS,
  createPackagedE2eSuiteSettlementWatch,
  observePackagedE2eSuiteSettlement,
  packagedE2ePlanningReady,
  readWorkspaceFailureDiagnostic,
  readWorkspacePipelineStage,
  readWorkspacePipelineStages,
  readWorkspaceDesignCandidateProgress,
  readWorkspacePlannerAttempt,
  readWorkspacePlannerProgress,
  readWorkspacePlannerProgressHistory,
  readWorkspacePrototypeSuiteProgress,
  readWorkspaceSelectedSuiteId,
  rejectFailedWorkspacePhase,
  retryFailureFrontier,
  retryPendingRun,
  retryUiGraceStartedAt,
  prototypeSuiteProgressCheckpointEntries,
  qualityAttentionPhaseEntries,
  readWorkspaceQualitySummaries,
} from './runner'
import { projectPackagedE2eDesignCandidateOwnerStage } from './design-candidate-owner'
import { prototypeRouteGraphFingerprint } from '@/prototype/prototype-plan'
import { tauriBridge } from '@/platform/native'

afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function makeVisible(element: HTMLElement): void {
  element.getClientRects = () => ({ length: 1 }) as DOMRectList
}

const digest = 'a'.repeat(64)
const indexedDigest = (index: number) => index.toString(16).padStart(64, '0')
const noPageActivity = {
  generatingPages: 0,
  reviewingPages: 0,
  retryingPages: 0,
  rejectedPages: 0,
} as const

function validIntent() {
  return { text: PACKAGED_E2E_CREATIVE_BRIEF, sha256: digest }
}

function validCaptures() {
  return (['design-systems', 'prototype-suites', 'selected-delivery'] as const).map((id) => ({
    id,
    sha256: digest,
    width: 1440,
    height: 900,
    byteLength: 4_096,
  }))
}

function collect(workspace: HTMLElement) {
  return collectPackagedE2eOutcome(
    workspace,
    validIntent(),
    validCaptures(),
    validEvidenceManifest(workspace),
  )
}

const deliveryDocumentRoles = [
  'plan', 'designMarkdown', 'cssVariables', 'tailwindTheme', 'tokensJson',
  'designIrTokens', 'routeGraph', 'pageMedia', 'manifest', 'bindings',
  'resourcePack', 'resourceArtifacts', 'provenance', 'reviewDocument',
  'pageReviews', 'resourceReviews',
] as const

function uploadFile(
  role: string,
  sha256: string,
  media?: { ordinal?: number; mediaType: string; width: number; height: number },
) {
  return {
    role,
    ...(media?.ordinal === undefined ? {} : { ordinal: media.ordinal }),
    sha256,
    byteLength: 1,
    bytesBase64: 'YQ==',
    ...(media ? {
      mediaType: media.mediaType,
      width: media.width,
      height: media.height,
    } : {}),
  }
}

function validEvidenceManifest(workspace: HTMLElement): import('./runner').PackagedE2eEvidenceManifest {
  const suites = JSON.parse(workspace.dataset.packagedE2eDeliveryEvidence!) as Array<{
    candidateId: string
    files: Array<{
      role: string
      ordinal?: number
      sha256: string
      byteLength: number
      bytesBase64: string
      mediaType?: string
      width?: number
      height?: number
    }>
  }>
  return {
    protocol: 'cutout.packaged-e2e-evidence.v1' as const,
    providerRoutes: [{
      purpose: 'image' as const,
      kind: 'openai',
      model: 'image-model',
      classification: 'remote' as const,
    }],
    files: [{
      role: 'designIr',
      path: `objects/${digest}`,
      sha256: digest,
      byteLength: 1,
    }, ...suites.flatMap((suite) => suite.files.map(({ bytesBase64: _bytes, ...file }) => ({
      ...file,
      candidateId: suite.candidateId,
      path: `objects/${file.sha256}`,
    })))],
  }
}

function completeOutcomeWorkspace(
  candidateCount = 3,
  resourceCounts: readonly number[] = Array.from(
    { length: candidateCount },
    (_, index) => [7, 11, 19][index] ?? index + 1,
  ),
): HTMLElement {
  const workspace = document.createElement('div')
  const routeCounts = Array.from({ length: candidateCount }, (_, index) => index + 4)
  workspace.dataset.packagedE2eDesignCandidates = JSON.stringify(
    Array.from({ length: candidateCount }, (_, index) => ({
      candidateId: `design-${index + 1}`,
      status: 'ready',
      ownerStage: 'terminal',
    })),
  )
  workspace.dataset.packagedE2eDeliveryEvidence = JSON.stringify(
    routeCounts.map((routeCount, suiteIndex) => {
      const routes = Array.from(
        { length: routeCount },
        (_, routeIndex) => `/suite-${suiteIndex + 1}/route-${routeIndex + 1}`,
      )
      const resourceCount = resourceCounts[suiteIndex] ?? 0
      const routeGraphDigest = indexedDigest(30_000 + suiteIndex)
      const routeGraph = prototypeRouteGraphFingerprint({
        pages: routes.map((route, index) => ({
          id: `page-${index + 1}`,
          name: `Page ${index + 1}`,
          route,
          purpose: `Serve ${route}.`,
          regions: [{
            id: `region-${index + 1}`,
            name: 'Primary content',
            role: 'content',
            summary: `Content for ${route}.`,
          }],
          overlays: [],
          states: [],
          interactions: [],
        })),
        flows: [{
          id: 'primary-flow',
          name: 'Primary flow',
          goal: 'Explore the planned experience.',
          startPageId: 'page-1',
          steps: [],
        }],
      })
      const designSystemMedia = {
        mediaType: 'image/png', width: 1440, height: 900,
        sha256: indexedDigest(1_000 + suiteIndex),
      }
      const pageMedia = routes.map((route, index) => ({
        ordinal: index + 1,
        route,
        mediaType: 'image/png',
        width: 1440,
        height: 900,
        sha256: indexedDigest(10_000 + suiteIndex * 100 + index),
      }))
      const resourceMedia = Array.from({ length: resourceCount }, (_, index) => ({
        ordinal: index + 1,
        mediaType: 'image/png',
        width: 512,
        height: 512,
        byteLength: 1,
        sha256: indexedDigest(20_000 + suiteIndex * 1_000 + index),
      }))
      return {
        candidateId: `suite-${suiteIndex + 1}`,
        designSystemId: `design-${suiteIndex + 1}`,
        resourcePackId: `resource-pack-${suiteIndex + 1}`,
        status: 'ready',
        routes,
        routeCount,
        pageCount: routeCount,
        resourceAssetCount: resourceCount,
        artifactCount: resourceCount,
        qualityReviewStatus: 'passed',
        routeGraph,
        designSystemMedia,
        pageMedia,
        resourceMedia,
        digests: {
          plan: digest,
          designSystemImage: designSystemMedia.sha256,
          designMarkdown: digest,
          cssVariables: digest,
          tailwindTheme: digest,
          tokensJson: digest,
          designIrTokens: digest,
          routeGraph: routeGraphDigest,
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
        files: [
          ...deliveryDocumentRoles.map((role) => uploadFile(
            role,
            role === 'routeGraph' ? routeGraphDigest : digest,
          )),
          uploadFile('designSystemMedia', designSystemMedia.sha256, designSystemMedia),
          ...pageMedia.map((media) => uploadFile('pageMediaObject', media.sha256, media)),
          ...resourceMedia.map((media) => uploadFile('resourceMediaObject', media.sha256, media)),
        ],
      }
    }),
  )
  const selectedIndex = Math.min(1, candidateCount - 1)
  workspace.dataset.packagedE2eSelectedSuiteId = `suite-${selectedIndex + 1}`
  workspace.dataset.packagedE2eVisibleSliceCount = String(resourceCounts[selectedIndex] ?? 0)
  workspace.dataset.packagedE2ePlanningTurnCount = '2'
  workspace.dataset.packagedE2eCodexPlanningTurnCount = '0'
  workspace.dataset.packagedE2eDirectPlanningTurnCount = '2'
  workspace.dataset.packagedE2ePlannedImageCallCount = '23'
  workspace.dataset.packagedE2eImageCallCount = '23'
  workspace.dataset.packagedE2eRetryStartCount = '0'
  workspace.dataset.packagedE2eRetryImageCallCount = '0'
  workspace.dataset.packagedE2eDesignIr = JSON.stringify({ version: 'design-ir.v1' })
  workspace.dataset.packagedE2eProviderRoutes = JSON.stringify([{
    purpose: 'image', kind: 'openai', model: 'image-model', classification: 'remote',
  }])
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

  it('derives the workload timeout from the Agent-authored candidate count', () => {
    expect(PACKAGED_E2E_MAX_CANDIDATE_COUNT).toBe(8)
    expect(PACKAGED_E2E_PER_SUITE_TIMEOUT_MS).toBe(45 * 60_000)
    expect(packagedE2eSuiteTimeoutMs(1)).toBe(45 * 60_000)
    expect(packagedE2eSuiteTimeoutMs(5)).toBe(5 * 45 * 60_000)
    expect(PACKAGED_E2E_ALL_SUITES_TIMEOUT_MS).toBe(8 * 45 * 60_000)
    expect(() => packagedE2eSuiteTimeoutMs(0)).toThrow()
    expect(() => packagedE2eSuiteTimeoutMs(9)).toThrow()
    expect(PACKAGED_E2E_CREATIVE_BRIEF).not.toMatch(/(?:生成|提供|先做)\s*[358]\s*套/u)
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

  it('allows conversation when planning is ready but image capabilities are missing', () => {
    document.body.innerHTML = [
      '<section data-ai-setup-status="action-required" data-ai-automatic-busy="false">',
      '<div data-ai-capability="planning" data-ai-capability-status="ready"></div>',
      '<div data-ai-capability="image-generation" data-ai-capability-status="action-required"></div>',
      '<div data-ai-capability="image-edit" data-ai-capability-status="action-required"></div>',
      '</section>',
    ].join('')

    expect(packagedE2ePlanningReady(document.querySelector('[data-ai-setup-status]'))).toBe(true)
  })

  it('does not enter conversation while planning is missing or setup is still changing', () => {
    document.body.innerHTML = [
      '<section data-ai-setup-status="action-required" data-ai-automatic-busy="false">',
      '<div data-ai-capability="planning" data-ai-capability-status="action-required"></div>',
      '</section>',
    ].join('')
    const setup = document.querySelector<HTMLElement>('[data-ai-setup-status]')
    expect(packagedE2ePlanningReady(setup)).toBe(false)

    setup!.dataset.aiAutomaticBusy = 'true'
    setup!.querySelector<HTMLElement>('[data-ai-capability="planning"]')!
      .dataset.aiCapabilityStatus = 'ready'
    expect(packagedE2ePlanningReady(setup)).toBe(false)
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

  it('acknowledges a creative submission only after its input clears and a new run owns it', () => {
    const workspace = document.createElement('div')
    const composer = document.createElement('textarea')
    workspace.dataset.packagedE2eActiveRunId = 'workspace:old'
    composer.value = PACKAGED_E2E_CREATIVE_BRIEF
    expect(hasFreshCreativeSubmission(workspace, composer, 'workspace:old')).toBe(false)

    composer.value = ''
    expect(hasFreshCreativeSubmission(workspace, composer, 'workspace:old')).toBe(false)

    workspace.dataset.packagedE2eActiveRunId = 'workspace:new'
    expect(hasFreshCreativeSubmission(workspace, composer, 'workspace:old')).toBe(true)
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

  it('holds a bounded failure window while React commits the Retry control', () => {
    const workspace = document.createElement('div')
    workspace.dataset.runFailed = 'true'
    workspace.dataset.agentWorking = 'false'

    const startedAt = retryUiGraceStartedAt(workspace, undefined, 1_000)
    expect(startedAt).toBe(1_000)
    expect(retryUiGraceStartedAt(workspace, startedAt, 1_000 + PACKAGED_E2E_RETRY_UI_GRACE_MS))
      .toBe(1_000)

    workspace.dataset.agentWorking = 'true'
    expect(retryUiGraceStartedAt(workspace, startedAt, 9_000)).toBeUndefined()
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

  it('does not replay the full run for a deterministic Planner graph failure', () => {
    document.body.innerHTML = [
      '<div data-workspace-root data-run-failed="true" data-packaged-e2e-run-diagnostic="planner-progressive-graph"></div>',
      '<div data-slot="agent-run-feed"><button data-agent-action="retry-run">Retry</button></div>',
    ].join('')
    const retry = document.querySelector<HTMLButtonElement>('button')!
    makeVisible(retry)
    const click = vi.fn()
    retry.addEventListener('click', click)

    expect(retryPendingRun(createPackagedE2eRetryTracker())).toBe(false)
    expect(click).not.toHaveBeenCalled()
  })

  it('binds Planner progress checkpoints to the retry attempt', () => {
    const progress = {
      stage: 'page' as const,
      completedPages: 3,
      totalPages: 6,
    }
    expect(plannerProgressCheckpointId(progress, 1))
      .toBe('planner-stage-page-attempt-1')
    expect(plannerProgressCheckpointId(progress, 3))
      .toBe('planner-stage-page-attempt-3')
    expect(plannerProgressCheckpointId(progress, PACKAGED_E2E_MAX_RUN_RETRIES + 1))
      .toBe(`planner-stage-page-attempt-${PACKAGED_E2E_MAX_RUN_RETRIES + 1}`)
    expect(() => plannerProgressCheckpointId(progress, 0))
      .toThrow('packaged-e2e-planner-attempt-invalid')
    expect(() => plannerProgressCheckpointId(progress, PACKAGED_E2E_MAX_RUN_RETRIES + 2))
      .toThrow('packaged-e2e-planner-attempt-invalid')
  })

  it('reads the product-owned Planner invocation instead of the run Retry count', () => {
    const workspace = document.createElement('div')
    workspace.dataset.packagedE2ePlannerAttemptCount = '2'
    workspace.dataset.packagedE2eRetryStartCount = '7'

    expect(readWorkspacePlannerAttempt(workspace)).toBe(2)
    workspace.dataset.packagedE2ePlannerAttemptCount = '0'
    expect(readWorkspacePlannerAttempt(workspace)).toBeUndefined()
    workspace.dataset.packagedE2ePlannerAttemptCount = String(
      PACKAGED_E2E_MAX_RUN_RETRIES + 2,
    )
    expect(readWorkspacePlannerAttempt(workspace)).toBeUndefined()
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
        ...noPageActivity,
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
    expect(PACKAGED_E2E_MAX_RUN_RETRIES).toBe(16)

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
      ...noPageActivity,
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
      ...noPageActivity,
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
      'planner-timeout',
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
      'provider-configuration-state',
      'provider-transport',
      'provider-output',
      'prototype-viewport',
      'board-decode',
      'board-composition',
      'board-zero-slices',
      'board-slot-assignment',
      'artifact-persistence',
      'generation-candidate',
      'orchestration-state',
      'quality-review-required',
      'planning-evidence-mismatch',
      'candidate-preparation-timeout',
      'candidate-approval-timeout',
      'candidate-provider-timeout',
      'candidate-post-processing-timeout',
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
      'planner-complete',
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
      'planner-complete',
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
      'planner-complete',
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
      { candidateId: 'design-1', status: 'generating', ownerStage: 'awaiting-approval' },
      { candidateId: 'design-2', status: 'ready', ownerStage: 'terminal' },
      { candidateId: 'design-3', status: 'failed', ownerStage: 'terminal' },
    ])
    expect(readWorkspaceDesignCandidateProgress(workspace)).toEqual([
      { candidateId: 'design-1', status: 'generating', ownerStage: 'awaiting-approval' },
      { candidateId: 'design-2', status: 'ready', ownerStage: 'terminal' },
      { candidateId: 'design-3', status: 'failed', ownerStage: 'terminal' },
    ])

    workspace.dataset.packagedE2eDesignCandidates = JSON.stringify([
      { candidateId: 'provider:private-account', status: 'failed', ownerStage: 'terminal' },
    ])
    expect(readWorkspaceDesignCandidateProgress(workspace)).toEqual([])

    workspace.dataset.packagedE2eDesignCandidates = JSON.stringify([
      { candidateId: 'design-1', status: 'generating', ownerStage: 'terminal' },
    ])
    expect(readWorkspaceDesignCandidateProgress(workspace)).toEqual([])
  })

  it('projects candidate ownership from the durable tool lifecycle without leaking route data', () => {
    const tools = {
      approval: {
        id: 'tool:run:design-system:candidate:quiet:generate',
        status: 'running' as const,
        approvalStatus: 'required' as const,
      },
    }
    expect(projectPackagedE2eDesignCandidateOwnerStage({
      candidateId: 'candidate:quiet', status: 'planned', tools: {},
    })).toBe('queued')
    expect(projectPackagedE2eDesignCandidateOwnerStage({
      candidateId: 'candidate:quiet', status: 'generating', tools: {},
    })).toBe('preparing')
    expect(projectPackagedE2eDesignCandidateOwnerStage({
      candidateId: 'candidate:quiet', status: 'generating', tools,
    })).toBe('awaiting-approval')
    expect(projectPackagedE2eDesignCandidateOwnerStage({
      candidateId: 'candidate:quiet', status: 'generating', tools: {
        approval: { ...tools.approval, approvalStatus: 'approved' },
      },
    })).toBe('provider-executing')
    expect(projectPackagedE2eDesignCandidateOwnerStage({
      candidateId: 'candidate:quiet', status: 'generating', tools: {
        approval: { ...tools.approval, status: 'succeeded', approvalStatus: 'approved' },
      },
    })).toBe('post-processing')
    expect(projectPackagedE2eDesignCandidateOwnerStage({
      candidateId: 'candidate:quiet', status: 'ready', tools,
    })).toBe('terminal')
  })

  it('times out the exact stalled candidate owner stage without a journey-wide guess', () => {
    const watch = createPackagedE2eCandidateOwnerWatch()
    const progress = [{
      candidateId: 'design-3' as const,
      status: 'generating' as const,
      ownerStage: 'awaiting-approval' as const,
    }]
    expect(observePackagedE2eCandidateOwners(progress, watch, 100)).toBeUndefined()
    expect(observePackagedE2eCandidateOwners(
      progress,
      watch,
      100 + PACKAGED_E2E_CANDIDATE_OWNER_DEADLINES_MS['awaiting-approval'] - 1,
    )).toBeUndefined()
    expect(observePackagedE2eCandidateOwners(
      progress,
      watch,
      100 + PACKAGED_E2E_CANDIDATE_OWNER_DEADLINES_MS['awaiting-approval'],
    )).toBe('candidate-approval-timeout')

    expect(observePackagedE2eCandidateOwners([{
      ...progress[0], ownerStage: 'provider-executing',
    }], watch, 50_000)).toBeUndefined()
    expect(watch.active.get('design-3')).toMatchObject({
      stage: 'provider-executing', since: 50_000,
    })
    expect(observePackagedE2eCandidateOwners([{
      ...progress[0], status: 'ready', ownerStage: 'terminal',
    }], watch, 50_001)).toBeUndefined()
    expect(watch.active.size).toBe(0)
  })

  it('settles a stalled candidate owner from the native clock when renderer timers are frozen', async () => {
    let settleNative!: () => void
    const native = new Promise<void>((resolve) => {
      settleNative = resolve
    })
    const nativeWait = vi.spyOn(tauriBridge, 'waitForMonotonicDeadline')
      .mockReturnValue(native)
    const nativeCancel = vi.spyOn(tauriBridge, 'cancelMonotonicDeadline')
      .mockResolvedValue(undefined)
    vi.stubGlobal('__TAURI_INTERNALS__', { invoke: vi.fn() })
    const rendererTimer = vi.spyOn(globalThis, 'setTimeout')
      .mockImplementation(() => 0 as never)
    const monitor = createPackagedE2eCandidateOwnerDeadlineMonitor()
    const progress = [{
      candidateId: 'design-3' as const,
      status: 'generating' as const,
      ownerStage: 'provider-executing' as const,
    }]

    expect(observePackagedE2eCandidateOwnerDeadlines(progress, monitor)).toBeUndefined()
    expect(nativeWait).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f-]{36}$/),
      PACKAGED_E2E_CANDIDATE_OWNER_DEADLINES_MS['provider-executing'],
    )
    expect(rendererTimer).not.toHaveBeenCalled()

    settleNative()
    await Promise.resolve()
    await Promise.resolve()

    expect(observePackagedE2eCandidateOwnerDeadlines(progress, monitor))
      .toBe('candidate-provider-timeout')
    cancelPackagedE2eCandidateOwnerDeadlines(monitor)
    expect(monitor.active.size).toBe(0)
    expect(nativeCancel).not.toHaveBeenCalled()
  })

  it('cancels an owner deadline when that candidate reaches a terminal state', () => {
    const nativeWait = vi.spyOn(tauriBridge, 'waitForMonotonicDeadline')
      .mockReturnValue(new Promise<void>(() => undefined))
    const nativeCancel = vi.spyOn(tauriBridge, 'cancelMonotonicDeadline')
      .mockResolvedValue(undefined)
    vi.stubGlobal('__TAURI_INTERNALS__', { invoke: vi.fn() })
    const monitor = createPackagedE2eCandidateOwnerDeadlineMonitor()

    observePackagedE2eCandidateOwnerDeadlines([{
      candidateId: 'design-3', status: 'generating', ownerStage: 'provider-executing',
    }], monitor)
    const deadlineId = nativeWait.mock.calls[0]![0]
    expect(observePackagedE2eCandidateOwnerDeadlines([{
      candidateId: 'design-3', status: 'ready', ownerStage: 'terminal',
    }], monitor)).toBeUndefined()
    expect(nativeCancel).toHaveBeenCalledWith(deadlineId)
  })

  it('cancels a timed-out owner through the real Agent run control', async () => {
    const workspace = document.createElement('div')
    workspace.dataset.workspaceRoot = ''
    workspace.dataset.agentWorking = 'true'
    const cancel = document.createElement('button')
    cancel.dataset.agentAction = 'cancel-run'
    cancel.addEventListener('click', () => {
      workspace.dataset.agentWorking = 'false'
    })
    document.body.append(workspace, cancel)

    await expect(cancelPackagedE2eActiveRun()).resolves.toBe(true)
    expect(workspace.dataset.agentWorking).toBe('false')
    cancel.remove()
    await expect(cancelPackagedE2eActiveRun()).resolves.toBe(false)
  })

  it('bounds a settled suite set that remains falsely busy', () => {
    const watch = createPackagedE2eSuiteSettlementWatch()
    const progress = [
      {
        candidateId: 'suite-1' as const,
        status: 'ready' as const,
        completedPages: 6,
        totalPages: 6,
        completedResources: 4,
        totalResources: 4,
        ...noPageActivity,
      },
      {
        candidateId: 'suite-2' as const,
        status: 'failed' as const,
        completedPages: 1,
        totalPages: 6,
        completedResources: 0,
        totalResources: 7,
        ...noPageActivity,
      },
    ]

    expect(observePackagedE2eSuiteSettlement(progress, true, watch, 100)).toBe(false)
    expect(observePackagedE2eSuiteSettlement(
      progress,
      true,
      watch,
      100 + PACKAGED_E2E_SUITE_SETTLEMENT_GRACE_MS - 1,
    )).toBe(false)
    expect(observePackagedE2eSuiteSettlement(
      progress,
      true,
      watch,
      100 + PACKAGED_E2E_SUITE_SETTLEMENT_GRACE_MS,
    )).toBe(true)

    expect(observePackagedE2eSuiteSettlement([
      { ...progress[1], status: 'generating' },
    ], true, watch, 200_000)).toBe(false)
    expect(watch.settledWhileWorkingSince).toBeUndefined()
    expect(observePackagedE2eSuiteSettlement(progress, false, watch, 200_001)).toBe(false)
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
        generatingPages: 0,
        reviewingPages: 2,
        retryingPages: 1,
        rejectedPages: 0,
      },
      {
        candidateId: 'suite-2',
        status: 'ready',
        completedPages: 6,
        totalPages: 6,
        completedResources: 13,
        totalResources: 13,
        ...noPageActivity,
      },
      {
        candidateId: 'suite-3',
        status: 'failed',
        completedPages: 1,
        totalPages: 6,
        completedResources: 0,
        totalResources: 13,
        generatingPages: 0,
        reviewingPages: 0,
        retryingPages: 0,
        rejectedPages: 1,
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
        generatingPages: 0,
        reviewingPages: 2,
        retryingPages: 1,
        rejectedPages: 0,
      },
      {
        candidateId: 'suite-2',
        status: 'ready',
        completedPages: 6,
        totalPages: 6,
        completedResources: 13,
        totalResources: 13,
        ...noPageActivity,
      },
      {
        candidateId: 'suite-3',
        status: 'failed',
        completedPages: 1,
        totalPages: 6,
        completedResources: 0,
        totalResources: 13,
        generatingPages: 0,
        reviewingPages: 0,
        retryingPages: 0,
        rejectedPages: 1,
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
      ...noPageActivity,
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
      generatingPages: 0,
      reviewingPages: 3,
      retryingPages: 0,
      rejectedPages: 0,
    })

    expect(checkpoints.map(({ id }) => id)).toEqual([
      'prototype-suite-1-generating-pages-6-of-6-resources-7-of-13',
      'prototype-suite-1-activity-reviewing-3',
      'prototype-suite-1-generating-pages-first-1-of-6-resources-7-of-13',
      'prototype-suite-1-generating-pages-half-3-of-6-resources-7-of-13',
      'prototype-suite-1-generating-pages-complete-6-of-6-resources-7-of-13',
      'prototype-suite-1-generating-pages-6-of-6-resources-first-1-of-13',
      'prototype-suite-1-generating-pages-6-of-6-resources-half-7-of-13',
    ])
    expect(checkpoints).toHaveLength(7)
    expect(checkpoints.every(({ id }) => id.length <= 80 && /^[a-z0-9-]+$/.test(id))).toBe(true)
    expect(JSON.stringify(checkpoints)).not.toMatch(/provider|credential|prompt|path/i)

    expect(prototypeSuiteProgressCheckpointEntries({
      candidateId: 'suite-1',
      status: 'ready',
      completedPages: 6,
      totalPages: 6,
      completedResources: 13,
      totalResources: 13,
      ...noPageActivity,
    })).toEqual([{
      key: 'suite-1:status:ready',
      id: 'prototype-suite-1-ready-pages-6-of-6-resources-13-of-13',
      status: 'passed',
    }])

    expect(prototypeSuiteProgressCheckpointEntries({
      candidateId: 'suite-1',
      status: 'generating',
      completedPages: 0,
      totalPages: 6,
      completedResources: 0,
      totalResources: 13,
      generatingPages: 1,
      reviewingPages: 2,
      retryingPages: 1,
      rejectedPages: 2,
    }).filter(({ key }) => key.includes(':activity:'))).toEqual([
      {
        key: 'suite-1:activity:generating',
        id: 'prototype-suite-1-activity-generating-1',
        status: 'passed',
      },
      {
        key: 'suite-1:activity:reviewing',
        id: 'prototype-suite-1-activity-reviewing-2',
        status: 'passed',
      },
      {
        key: 'suite-1:activity:retrying',
        id: 'prototype-suite-1-activity-retrying-1',
        status: 'passed',
      },
      {
        key: 'suite-1:activity:rejected',
        id: 'prototype-suite-1-activity-rejected-2',
        status: 'passed',
      },
    ])

    expect(prototypeSuiteProgressCheckpointEntries({
      candidateId: 'suite-1',
      status: 'failed',
      completedPages: 2,
      totalPages: 6,
      completedResources: 0,
      totalResources: 13,
      generatingPages: 0,
      reviewingPages: 0,
      retryingPages: 0,
      rejectedPages: 1,
    })).toEqual([{
      key: 'suite-1:status:failed',
      id: 'prototype-suite-1-failed-pages-2-of-6-resources-0-of-13',
      status: 'passed',
    }])
  })
})

describe('packaged E2E outcome evidence', () => {
  it('rejects review warnings as release-quality proof', () => {
    const workspace = completeOutcomeWorkspace()
    const suites = JSON.parse(workspace.dataset.packagedE2eDeliveryEvidence!) as Array<{
      qualityReviewStatus: string
    }>
    suites[0]!.qualityReviewStatus = 'attention-required'
    workspace.dataset.packagedE2eDeliveryEvidence = JSON.stringify(suites)

    expect(() => collect(workspace)).toThrow(JourneyFailure)
    expect(hasCompleteDeliveryEvidence(workspace)).toBe(false)
    expect(hasAttentionRequiredDeliveryEvidence(workspace)).toBe(true)
    expect(hasDeliveryEvidenceForEverySuite(workspace, 3)).toBe(true)
  })

  it('records only closed quality categories and bounded counts', () => {
    const workspace = completeOutcomeWorkspace(2)
    workspace.dataset.packagedE2eQualitySummaries = JSON.stringify([{
      candidateId: 'suite-1',
      pageRejectedCount: 1,
      pageUnavailableCount: 0,
      resourceRejectedCount: 0,
      resourceUnavailableCount: 2,
      resourceObservationalIssueCount: 3,
    }, {
      candidateId: 'suite-2',
      pageRejectedCount: 0,
      pageUnavailableCount: 1,
      resourceRejectedCount: 4,
      resourceUnavailableCount: 0,
      resourceObservationalIssueCount: 0,
    }])

    expect(readWorkspaceQualitySummaries(workspace)).toHaveLength(2)
    expect(qualityAttentionPhaseEntries(workspace)).toEqual([
      { id: 'quality-page-rejected-1', status: 'failed' },
      { id: 'quality-page-unavailable-1', status: 'failed' },
      { id: 'quality-resource-rejected-4', status: 'failed' },
      { id: 'quality-resource-unavailable-2', status: 'failed' },
      { id: 'quality-resource-observational-3', status: 'failed' },
    ])
    expect(JSON.stringify(qualityAttentionPhaseEntries(workspace)))
      .not.toMatch(/provider|prompt|path|message/i)
  })

  it('fails closed when quality-summary structure is not reviewed', () => {
    const workspace = completeOutcomeWorkspace(1)
    workspace.dataset.packagedE2eQualitySummaries = JSON.stringify([{
      candidateId: 'suite-1',
      pageRejectedCount: 1,
      pageUnavailableCount: 0,
      resourceRejectedCount: 0,
      resourceUnavailableCount: 0,
      resourceObservationalIssueCount: 0,
      rawReview: 'must not escape',
    }])
    expect(readWorkspaceQualitySummaries(workspace)).toEqual([])
    expect(qualityAttentionPhaseEntries(workspace)).toEqual([
      { id: 'quality-diagnostic-unavailable-1', status: 'failed' },
    ])
  })

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
    const outcome = collect(completeOutcomeWorkspace())

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
    expect(outcome.prototypeSuites.map((suite) => suite.routes.length)).toEqual([4, 5, 6])
    expect(outcome.prototypeSuites.map((suite) => suite.resourceAssetCount)).toEqual([7, 11, 19])
    expect(outcome).toMatchObject({
      selectedSuiteId: 'suite-2',
      selectedVisibleSliceCount: 11,
      planningTurnCount: 2,
      planningRuntimeCounts: { codexSystem: 0, direct: 2 },
      plannedImageCallCount: 23,
      imageCallCount: 23,
    })
    expect(outcome).not.toHaveProperty('coding')
    expect(JSON.stringify(outcome)).not.toMatch(/prompt|providerId|credential|localPath/i)
  })

  it.each([1, 2, 5, 8])(
    'accepts %i Agent-authored Design System and route-suite candidates',
    (candidateCount) => {
      const workspace = completeOutcomeWorkspace(candidateCount)
      if (candidateCount === 8) {
        expect(workspace.dataset.packagedE2eDeliveryEvidence!.length).toBeGreaterThan(32_768)
      }
      const outcome = collect(workspace)
      expect(outcome.designSystems).toHaveLength(candidateCount)
      expect(outcome.prototypeSuites).toHaveLength(candidateCount)
    },
  )

  it('rejects delivery evidence beyond the bounded dynamic-plan budget', () => {
    const workspace = completeOutcomeWorkspace()
    const evidence = validEvidenceManifest(workspace)
    workspace.dataset.packagedE2eDeliveryEvidence = 'x'.repeat(
      PACKAGED_E2E_MAX_DELIVERY_EVIDENCE_LENGTH + 1,
    )
    expect(() => collectPackagedE2eOutcome(
      workspace,
      validIntent(),
      validCaptures(),
      evidence,
    )).toThrow(JourneyFailure)
  })

  it('accepts a complete Agent-authored suite with no reusable non-UI assets', () => {
    const outcome = collect(completeOutcomeWorkspace(1, [0]))
    expect(outcome.prototypeSuites[0]).toMatchObject({
      resourceAssetCount: 0,
      artifactCount: 0,
      resourceMedia: [],
    })
    expect(outcome.selectedVisibleSliceCount).toBe(0)
  })

  it('rejects hidden paid-image amplification beyond the benchmark DAG', () => {
    const workspace = completeOutcomeWorkspace()
    workspace.dataset.packagedE2eImageCallCount = '24'
    expect(() => collect(workspace)).toThrow(JourneyFailure)
  })

  it('rejects completion without both successful planning turns', () => {
    const workspace = completeOutcomeWorkspace()
    workspace.dataset.packagedE2ePlanningTurnCount = '1'
    expect(() => collect(workspace)).toThrow(JourneyFailure)
  })

  it('rejects planning provenance that does not sum to the successful turn count', () => {
    const workspace = completeOutcomeWorkspace()
    workspace.dataset.packagedE2eDirectPlanningTurnCount = '1'
    expect(() => collect(workspace)).toThrow(JourneyFailure)
  })

  it('rejects an actual call count that differs from the compiled material plan', () => {
    const workspace = completeOutcomeWorkspace()
    workspace.dataset.packagedE2ePlannedImageCallCount = '22'
    expect(() => collect(workspace)).toThrow(JourneyFailure)
  })

  it('rejects duplicate route graphs and incomplete resource quantities', () => {
    const duplicate = completeOutcomeWorkspace()
    const suites = JSON.parse(duplicate.dataset.packagedE2eDeliveryEvidence!) as Array<{
      routeGraph: string
      resourceAssetCount: number
    }>
    suites[2]!.routeGraph = suites[0]!.routeGraph
    duplicate.dataset.packagedE2eDeliveryEvidence = JSON.stringify(suites)
    expect(() => collect(duplicate)).toThrow(JourneyFailure)

    const incomplete = completeOutcomeWorkspace()
    const incompleteSuites = JSON.parse(
      incomplete.dataset.packagedE2eDeliveryEvidence!,
    ) as Array<{ resourceAssetCount: number }>
    incompleteSuites[1]!.resourceAssetCount = 0
    incomplete.dataset.packagedE2eDeliveryEvidence = JSON.stringify(incompleteSuites)
    expect(() => collect(incomplete)).toThrow(JourneyFailure)
  })

  it('accepts route-identical suites with different canonical information graphs', () => {
    const workspace = completeOutcomeWorkspace(2)
    const suites = JSON.parse(workspace.dataset.packagedE2eDeliveryEvidence!) as Array<{
      routes: string[]
      routeCount: number
      pageCount: number
      routeGraph: string
      pageMedia: Array<{ ordinal: number; route: string }>
      files: Array<{ role: string; ordinal?: number }>
    }>
    const first = suites[0]!
    const second = suites[1]!
    second.routes = [...first.routes]
    second.routeCount = first.routeCount
    second.pageCount = first.pageCount
    second.pageMedia = second.pageMedia.slice(0, first.pageCount).map((media, index) => ({
      ...media,
      route: first.routes[index]!,
    }))
    second.files = second.files.filter((file) =>
      file.role !== 'pageMediaObject' || (file.ordinal ?? 0) <= first.pageCount)
    const alternative = JSON.parse(first.routeGraph) as {
      pages: Array<{ regions: Array<{ summary: string }> }>
    }
    alternative.pages[0]!.regions[0]!.summary = 'A distinct task-oriented information hierarchy.'
    second.routeGraph = JSON.stringify(alternative)
    workspace.dataset.packagedE2eDeliveryEvidence = JSON.stringify(suites)

    expect(() => collect(workspace)).not.toThrow()
  })

  it('rejects duplicate media across suites and artifact roles', () => {
    for (const duplicateHash of [
      (suites: Array<{
        designSystemMedia: { sha256: string }
        pageMedia: Array<{ sha256: string }>
      }>) => {
        suites[1]!.pageMedia[0]!.sha256 = suites[0]!.pageMedia[0]!.sha256
      },
      (suites: Array<{
        designSystemMedia: { sha256: string }
        pageMedia: Array<{ sha256: string }>
        resourceMedia: Array<{ sha256: string }>
      }>) => {
        suites[1]!.resourceMedia[0]!.sha256 = suites[0]!.resourceMedia[0]!.sha256
      },
      (suites: Array<{
        designSystemMedia: { sha256: string }
        pageMedia: Array<{ sha256: string }>
      }>) => {
        suites[0]!.pageMedia[0]!.sha256 = suites[0]!.designSystemMedia.sha256
      },
    ]) {
      const workspace = completeOutcomeWorkspace()
      const suites = JSON.parse(workspace.dataset.packagedE2eDeliveryEvidence!)
      duplicateHash(suites)
      workspace.dataset.packagedE2eDeliveryEvidence = JSON.stringify(suites)
      expect(() => collect(workspace)).toThrow(JourneyFailure)
    }
  })

  it('rejects prototype suites that do not bind one-to-one to ready Design Systems', () => {
    const workspace = completeOutcomeWorkspace()
    const suites = JSON.parse(workspace.dataset.packagedE2eDeliveryEvidence!) as Array<{
      designSystemId: string
    }>
    suites[2]!.designSystemId = suites[0]!.designSystemId
    workspace.dataset.packagedE2eDeliveryEvidence = JSON.stringify(suites)

    expect(() => collect(workspace)).toThrow(JourneyFailure)
  })

  it('rejects duplicate resource-pack identities and malformed digests', () => {
    const duplicate = completeOutcomeWorkspace()
    const duplicateSuites = JSON.parse(duplicate.dataset.packagedE2eDeliveryEvidence!) as Array<{
      resourcePackId: string
    }>
    duplicateSuites[2]!.resourcePackId = duplicateSuites[0]!.resourcePackId
    duplicate.dataset.packagedE2eDeliveryEvidence = JSON.stringify(duplicateSuites)
    expect(() => collect(duplicate)).toThrow(JourneyFailure)

    for (const digest of ['A'.repeat(64), 'g'.repeat(64), 'a'.repeat(63)]) {
      const workspace = completeOutcomeWorkspace()
      const suites = JSON.parse(workspace.dataset.packagedE2eDeliveryEvidence!) as Array<{
        digests: { designSystemImage: string }
      }>
      suites[0]!.digests.designSystemImage = digest
      workspace.dataset.packagedE2eDeliveryEvidence = JSON.stringify(suites)
      expect(() => collect(workspace)).toThrow(JourneyFailure)
    }
  })

  it('rejects a visible consumable count that differs from selected production authority', () => {
    const slices = completeOutcomeWorkspace()
    slices.dataset.packagedE2eVisibleSliceCount = '47'
    expect(() => collect(slices)).toThrow(JourneyFailure)
  })

  it('rejects non-opaque ids, unbounded routes, and extra payload fields', () => {
    const workspace = completeOutcomeWorkspace()
    const designs = JSON.parse(workspace.dataset.packagedE2eDesignCandidates!) as Array<
      Record<string, unknown>
    >
    designs[0] = { ...designs[0], candidateId: 'candidate:generated-title', prompt: 'secret' }
    workspace.dataset.packagedE2eDesignCandidates = JSON.stringify(designs)

    expect(() => collect(workspace)).toThrow(JourneyFailure)
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
      expect(() => collect(workspace)).toThrow(JourneyFailure)
    }
  })
})
