import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from '@lingui/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SettingsUIProvider } from '@/components/settings/settings-ui'
import { LibraryUIProvider } from '@/components/library/library-ui'
import { ImageImportActionsProvider } from '@/hooks/image-import-actions'
import { ServiceProvider } from '@/services/context'
import { activateLocale, i18n } from '@/i18n/index'
import { getStoreState } from '@/store'
import { err, ok, type Result, type ServiceRegistry } from '@/services/types'
import type { GenerateInput } from '@/services/ai/types'
import type { ModelAssignments } from '@/services/ai/model-assignment-types'
import { capabilityBindingsSchema } from '@/services/ai/model-capabilities'
import type { PrototypePage, PrototypePlan } from '@/prototype/prototype-plan'
import { compilePrototypeImageRequestBudget } from '@/prototype/production-throughput'
import { designSystemMarkdownValidationError } from '@/prototype/design-system-validation'
import { pngDimensionFixture } from '@/lib/raster-dimensions.test-fixture'
import { readRasterDimensions } from '@/lib/raster-dimensions'
import type { VisualGenerationTask } from '@/visual-generation'
import { IntentWorkspace } from './IntentWorkspace'
import { installE2eLocalStorage } from './intent-workspace.e2e.testkit'

const PROVIDER_ID = 'provider:e2e'
const CHAT_MODEL = 'chat-e2e'
const IMAGE_MODEL = 'gpt-image-2'
const EDIT_MODEL = IMAGE_MODEL

const desktopHarness = vi.hoisted(() => ({
  artifacts: new Map<string, { bytes: Uint8Array; mediaType: string }>(),
  contentAddresses: new Map<string, string>(),
  tasks: [] as VisualGenerationTask[],
  imageToolPrompts: [] as string[],
  imageToolCallIds: [] as string[],
  imageToolSignals: [] as Array<AbortSignal | undefined>,
  imageToolReferenceCounts: [] as number[],
  imageToolReferenceBytes: [] as Uint8Array[][],
  imageToolOutputs: new Map<string, Uint8Array>(),
  imageToolModels: [] as string[],
  imageToolFailure: null as null | ((toolCallId: string) => Error | null),
  imageToolWait: null as null | ((toolCallId: string) => Promise<void>),
  activeImageCalls: 0,
  maximumImageConcurrency: 0,
  boardPrompts: [] as string[],
  boardFailure: null as null | ((prompt: string) => Error | null),
  activeBoardCalls: 0,
  maximumBoardConcurrency: 0,
  sliceCoverageOmission: null as null | ((regionId: string) => boolean),
  sliceSequence: 0,
  sequence: 0,
  plannerCalls: 0,
  plannerPrompts: [] as string[],
  progressivePlannerStages: [] as string[],
  plannerFailure: null as null | ((call: number, prompt: string) => string | null),
  pageQaCalls: 0,
  pageQaVerdict: null as null | ((checklist: string, call: number) => {
    readonly pass: boolean
    readonly failures: readonly string[]
  }),
  providerTests: 0,
  directToolGateCalls: 0,
  directTextCalls: 0,
  editRouteEnabled: true,
  taskFitRouteEnabled: true,
}))

const codexHarness = vi.hoisted(() => ({
  enabled: false,
  turns: 0,
  plannerStages: [] as string[],
}))

const runtimeConfigHarness = vi.hoisted(() => ({
  configured: true,
  providerLoads: 0,
  assignmentLoads: 0,
  bindingLoads: 0,
}))

function artifactId(sequence: number): string {
  return `artifact:sha256:${sequence.toString(16).padStart(64, '0')}`
}

function persistArtifact(bytes: Uint8Array, mediaType: string): string {
  const key = `${mediaType}:${[...bytes].join(',')}`
  const existing = desktopHarness.contentAddresses.get(key)
  if (existing) return existing
  desktopHarness.sequence += 1
  const id = artifactId(desktopHarness.sequence)
  desktopHarness.contentAddresses.set(key, id)
  desktopHarness.artifacts.set(id, { bytes, mediaType })
  return id
}

vi.mock('@/services/ai/model-assignment.local', () => {
  const loadBindings = async () => {
    runtimeConfigHarness.bindingLoads += 1
    if (!runtimeConfigHarness.configured) {
      return capabilityBindingsSchema.parse({
        version: 'model-assignments.v2',
        bindings: {},
        descriptors: [],
      })
    }
    const imageModel = desktopHarness.taskFitRouteEnabled ? IMAGE_MODEL : 'image-e2e'
    return capabilityBindingsSchema.parse({
    version: 'model-assignments.v2',
    bindings: {
      text: { providerId: PROVIDER_ID, model: CHAT_MODEL },
      vision: { providerId: PROVIDER_ID, model: CHAT_MODEL },
      'image-generation': { providerId: PROVIDER_ID, model: imageModel },
      ...(desktopHarness.editRouteEnabled
        ? { 'image-edit': { providerId: PROVIDER_ID, model: EDIT_MODEL } }
        : {}),
    },
    descriptors: [
      {
        providerId: PROVIDER_ID,
        model: imageModel,
        capabilities: ['image-generation'],
        source: 'verified-catalog',
        evidence: [
          { capability: 'image-generation', kind: 'verified', sourceId: 'rendered-e2e' },
        ],
      },
      ...(desktopHarness.editRouteEnabled
        ? [{
            providerId: PROVIDER_ID,
            model: EDIT_MODEL,
            capabilities: ['image-edit'],
            source: 'verified-catalog',
            evidence: [
              { capability: 'image-edit', kind: 'observed', sourceId: 'rendered-e2e' },
            ],
          }]
        : []),
    ],
    })
  }
  return {
  loadCapabilityBindings: loadBindings,
  loadRuntimeCapabilityBindings: loadBindings,
  loadAssignments: async (): Promise<ModelAssignments> => {
    runtimeConfigHarness.assignmentLoads += 1
    return runtimeConfigHarness.configured
      ? {
          chat: { providerId: PROVIDER_ID, model: CHAT_MODEL },
          image: {
            providerId: PROVIDER_ID,
            model: desktopHarness.taskFitRouteEnabled ? IMAGE_MODEL : 'image-e2e',
          },
        }
      : {}
  },
  setAssignment: async () => ({}),
  }
})

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (command: string, args?: {
    input?: { requestId?: string; contextRevision?: string; prompt?: string }
  }) => {
    if (!codexHarness.enabled) {
      throw new Error('Tauri invoke is not available in this component E2E test')
    }
    if (command === 'codex_system_probe') {
      return {
        runtimeId: 'codex-system',
        installed: true,
        authenticated: true,
        authClass: 'chatgpt',
        capability: 'proven',
        execution: 'unproven',
        version: '0.146.0',
      }
    }
    if (command !== 'codex_system_turn_start') {
      throw new Error(`Unexpected native command: ${command}`)
    }
    codexHarness.turns += 1
    const prompt = args?.input?.prompt ?? ''
    const plannerStage = codexPlannerStage(prompt)
    if (plannerStage) codexHarness.plannerStages.push(plannerStage)
    return {
      output: codexTurnOutput(prompt),
      receipt: {
        protocol: 'cutout.codex-execution.v1',
        runtimeId: 'codex-system',
        runtimeVersion: '0.146.0',
        bindingId: 'codex:field-notes',
        requestId: args?.input?.requestId,
        turnId: `turn.field-notes.${codexHarness.turns}`,
        contextRevision: args?.input?.contextRevision,
        contextDigest: 'a'.repeat(64),
        outputDigest: 'b'.repeat(64),
        completedAt: 1,
      },
    }
  },
  Channel: class {
    onmessage = (_payload: unknown) => {}
  },
}))

vi.mock('@/agent-runtime/use-desktop-tool-loop', () => ({
  useDesktopToolLoop: () => ({
    loop: {
      approve: async () => {},
      deny: () => {},
      cancel: () => {},
      retry: async () => {},
    },
    invoke: async (request: {
      readonly prompt?: string
      readonly toolCallId: string
      readonly signal?: AbortSignal
      readonly inputs?: readonly { readonly bytes?: Uint8Array }[]
      readonly image: { readonly model: string }
    }) => {
      const prompt = request.prompt ?? ''
      desktopHarness.imageToolPrompts.push(prompt)
      desktopHarness.imageToolCallIds.push(request.toolCallId)
      desktopHarness.imageToolSignals.push(request.signal)
      desktopHarness.imageToolReferenceCounts.push(request.inputs?.length ?? 0)
      desktopHarness.imageToolReferenceBytes.push(
        request.inputs?.map(({ bytes }) => bytes ? new Uint8Array(bytes) : new Uint8Array()) ?? [],
      )
      desktopHarness.imageToolModels.push(request.image.model)
      desktopHarness.activeImageCalls += 1
      desktopHarness.maximumImageConcurrency = Math.max(
        desktopHarness.maximumImageConcurrency,
        desktopHarness.activeImageCalls,
      )
      try {
        const wait = desktopHarness.imageToolWait?.(request.toolCallId)
        if (wait) {
          await waitForMockImageTool(wait, request.signal)
        }
        const failure = desktopHarness.imageToolFailure?.(request.toolCallId)
        if (failure) throw failure
        const marker = prompt.includes('Editorial Ledger')
          ? 21
          : prompt.includes('Workshop Console')
            ? 31
            : 11
        const bytes = pngDimensionFixture(
          1440,
          960,
          marker + (desktopHarness.imageToolCallIds.length % 20),
        )
        desktopHarness.imageToolOutputs.set(request.toolCallId, bytes)
        return [{
          bytes,
          mediaType: 'image/png',
        }]
      } finally {
        desktopHarness.activeImageCalls -= 1
      }
    },
    visualRuntime: {
      execute: async (_runId: string, task: VisualGenerationTask) => {
        desktopHarness.tasks.push(task)
        const pageNumber = (task.consistency.serial ?? 0) + 16
        const id = persistArtifact(
          new Uint8Array([pageNumber, pageNumber + 1, pageNumber + 2]),
          'image/png',
        )
        return { promotion: { masterArtifactId: id } }
      },
    },
    resolveArtifact: async (id: string) => desktopHarness.artifacts.get(id) ?? null,
    persistReference: async (bytes: Uint8Array, mediaType: string) =>
      persistArtifact(bytes, mediaType),
    persistCutout: async (bytes: Uint8Array, mediaType: string) => {
      const id = persistArtifact(bytes, mediaType)
      return { artifactId: id, sha256: id.slice('artifact:sha256:'.length) }
    },
  }),
}))

vi.mock('@/lib/image', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/image')>(),
  decodeImage: async (blob: Blob) => {
    const dimensions = readRasterDimensions(new Uint8Array(await blob.arrayBuffer()))
    return {
      width: dimensions?.width ?? 300,
      height: dimensions?.height ?? 300,
      close: () => {},
    } as unknown as ImageBitmap
  },
}))

vi.mock('@/prototype/region-deconstruct', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/prototype/region-deconstruct')>(),
  sliceRegionBoardBitmap: async (
    _bitmap: ImageBitmap,
    _params: unknown,
    regionId: string,
    pageId: string,
  ) => {
    const match = /-materials-\d+-(\d+)$/.exec(regionId)
    const materialCount = match ? Number(match[1]) : 0
    if (!Number.isSafeInteger(materialCount) || materialCount < 1) {
      throw new Error(`Unexpected board region without planned materials: ${regionId}`)
    }
    const columns = Math.max(1, Math.ceil(Math.sqrt(materialCount)))
    const rows = Math.ceil(materialCount / columns)
    const cellWidth = 300 / columns
    const cellHeight = 300 / rows
    const omitForeground = desktopHarness.sliceCoverageOmission?.(regionId) === true
    const totalForegroundPixelCount = materialCount * 10_000
    const omittedForegroundPixelCount = omitForeground ? 20 : 0
    return {
      slices: Array.from({ length: materialCount }, (_, index) => {
        desktopHarness.sliceSequence += 1
        const sequence = desktopHarness.sliceSequence
        const bytes = new Uint8Array([
          Math.floor(sequence / 256),
          sequence % 256,
        ])
        const blob = new Blob([bytes], { type: 'image/png' })
        Object.defineProperty(blob, 'arrayBuffer', {
          value: async () => bytes.slice().buffer,
        })
        const column = index % columns
        const row = Math.floor(index / columns)
        const x = Math.floor(column * cellWidth) + 10
        const y = Math.floor(row * cellHeight) + 10
        const width = Math.floor((column + 1) * cellWidth) - x - 10
        const height = Math.floor((row + 1) * cellHeight) - y - 10
        return {
          id: `slice:${pageId}:${regionId}:${index}`,
          index,
          box: { x, y, width, height },
          blob,
          width,
          height,
          regionId,
          pageId,
        }
      }),
      diagnostics: { borderWhiteRatio: 1, whiteRatio: 0.9, compliant: true },
      coverage: {
        totalForegroundPixelCount,
        retainedForegroundPixelCount:
          totalForegroundPixelCount - omittedForegroundPixelCount,
        omittedForegroundPixelCount,
        retainedRatio:
          (totalForegroundPixelCount - omittedForegroundPixelCount)
          / totalForegroundPixelCount,
      },
    }
  },
}))

const verificationStorage = installE2eLocalStorage()

const DESIGN_MARKDOWN = `---
tokens:
  colors:
    canvas: "#F8FAFC"
    surface: "#FFFFFF"
    ink: "#111827"
    muted: "#64748B"
    accent: "#0F766E"
  spacing:
    sm: 8px
    md: 16px
  radius:
    sm: 4px
    md: 8px
---

# Route Suite

Use one quiet navigation shell, stable typography, and consistent controls across every route.
`

const PAGE_MATERIAL_GROUPS: readonly (readonly number[])[] = [
  [],
  [1],
  [2],
  [3],
  [2, 3],
  [3, 4],
] as const
const MATERIALS_PER_SUITE = PAGE_MATERIAL_GROUPS.flat().reduce(
  (total, count) => total + count,
  0,
)
const BOARD_GROUPS_PER_SUITE = PAGE_MATERIAL_GROUPS.reduce(
  (total, groups) => total + groups.length,
  0,
)

function pageRegions(
  pageId: string,
  materialGroups: readonly number[],
): PrototypePage['regions'] {
  const interfaceRegion: PrototypePage['regions'][number] = {
    id: `${pageId}-content`,
    name: 'Route content',
    role: 'main',
    summary: `Primary content for ${pageId}`,
    complexity: 'medium',
    decompositionStrategy: 'region-crop',
    assetRoute: 'ignore-code-ui',
    assetOpportunities: [],
  }
  return [
    interfaceRegion,
    ...materialGroups.map((materialCount, groupIndex) => ({
      id: `${pageId}-materials-${groupIndex + 1}-${materialCount}`,
      name: `Reusable visual material family ${groupIndex + 1}`,
      role: 'visual-materials',
      summary: `Reusable non-UI visual family ${groupIndex + 1} for ${pageId}`,
      complexity: 'medium' as const,
      decompositionStrategy: 'region-crop' as const,
      assetRoute: 'board-cutout' as const,
      assetOpportunities: Array.from(
        { length: materialCount },
        (_, index) => `${pageId} family ${groupIndex + 1} asset ${index + 1}`,
      ),
    })),
  ]
}

function page(
  id: string,
  name: string,
  route: string,
  materialGroups: readonly number[],
  next?: { id: string; pageId: string },
): PrototypePage {
  return {
    id,
    name,
    route,
    purpose: `Complete the ${name.toLowerCase()} task`,
    viewport: {
      platform: 'responsive web app',
      width: 1440,
      height: 960,
      scroll: 'single-screen',
    },
    regions: pageRegions(id, materialGroups),
    overlays: [],
    states: [],
    interactions: next
      ? [{
          id: next.id,
          label: `Go to ${next.pageId}`,
          trigger: 'click',
          sourceSectionId: `${id}-content`,
          sourceElement: 'Primary navigation',
          intent: `Open ${next.pageId}`,
          action: { type: 'navigate', targetPageId: next.pageId },
        }]
      : [],
  }
}

// Deterministic stand-in for the Planner Agent's structured response. The
// shipping workspace never imports this route tree; it consumes whichever
// valid page graph the configured Agent derives from the user's product intent.
const AGENT_PLAN: PrototypePlan = {
  version: 'prototype-plan.v0',
  product: {
    name: 'Atlas',
    projectName: 'Atlas route suite',
    summary: 'A complete multi-route product prototype.',
    audience: 'Product operators',
    primaryGoal: 'Complete product and account workflows.',
    platform: 'responsive web app',
  },
  designSystem: {
    styleSummary: 'Quiet professional interface with a persistent navigation shell.',
    palette: ['canvas white', 'ink', 'teal accent', 'neutral surface'],
    typography: 'Readable sans-serif hierarchy',
    spacing: '8px grid',
    componentPrinciples: ['Stable navigation', 'Consistent actions'],
    assetDirection: 'Create attributable route artwork while keeping ordinary UI in code.',
    exploration: {
      mode: 'fixed',
      decidedBy: 'user',
      count: 3,
      rationale: 'Compare three deliberate visual systems before producing the route suite.',
      directions: [
        {
          id: 'signal-grid',
          label: 'Signal Grid',
          thesis: 'Dense operational clarity with crisp data hierarchy.',
          vary: ['information density', 'grid rhythm'],
          preserve: ['product workflows', 'route graph', 'accessibility'],
        },
        {
          id: 'editorial-ledger',
          label: 'Editorial Ledger',
          thesis: 'Editorial typography and calm merchandising surfaces.',
          vary: ['typographic voice', 'surface treatment'],
          preserve: ['product workflows', 'route graph', 'accessibility'],
        },
        {
          id: 'workshop-console',
          label: 'Workshop Console',
          thesis: 'Tactile workbench controls with explicit operational state.',
          vary: ['control treatment', 'visual texture'],
          preserve: ['product workflows', 'route graph', 'accessibility'],
        },
      ],
      bounds: { maxCandidates: 8, maxParallelism: 2 },
    },
  },
  pages: [
    page('home', 'Home', '/', PAGE_MATERIAL_GROUPS[0]!, { id: 'open-catalog', pageId: 'catalog' }),
    page('catalog', 'Catalog', '/catalog', PAGE_MATERIAL_GROUPS[1]!, { id: 'open-product', pageId: 'product' }),
    page('product', 'Product', '/products/:productId', PAGE_MATERIAL_GROUPS[2]!, { id: 'open-cart', pageId: 'cart' }),
    page('cart', 'Cart', '/cart', PAGE_MATERIAL_GROUPS[3]!),
    page('account', 'Account', '/account', PAGE_MATERIAL_GROUPS[4]!, { id: 'open-settings', pageId: 'settings' }),
    page('settings', 'Settings', '/settings', PAGE_MATERIAL_GROUPS[5]!),
  ],
  flows: [
    {
      id: 'shopping',
      name: 'Shopping flow',
      goal: 'Move from discovery to checkout.',
      startPageId: 'home',
      steps: [
        { fromPageId: 'home', interactionId: 'open-catalog', toPageId: 'catalog' },
        { fromPageId: 'catalog', interactionId: 'open-product', toPageId: 'product' },
        { fromPageId: 'product', interactionId: 'open-cart', toPageId: 'cart' },
      ],
    },
    {
      id: 'account-management',
      name: 'Account management flow',
      goal: 'Move from account to settings.',
      startPageId: 'account',
      steps: [{ fromPageId: 'account', interactionId: 'open-settings', toPageId: 'settings' }],
    },
  ],
  reviewDocument: {
    format: 'markdown',
    primaryFlow: '# Shopping flow',
    fullPlan: '# Complete route suite',
  },
  humanLoop: {
    mode: 'continue',
    rationale: 'All routes, audiences, and workflows are explicit.',
  },
}

const FIELD_NOTES_PLAN: PrototypePlan = {
  version: 'prototype-plan.v0',
  product: {
    name: 'Field Notes',
    projectName: 'Field Notes',
    summary: 'A focused place journal for preserving one complete route story.',
    audience: 'Independent walkers',
    primaryGoal: 'Turn one field route into a readable story with a reusable marker.',
    platform: 'responsive web app',
  },
  designSystem: {
    styleSummary: 'Editorial field-guide typography with quiet cartographic accents.',
    palette: ['paper white', 'graphite ink', 'trail green'],
    typography: 'Readable editorial serif paired with compact sans-serif labels.',
    spacing: 'An 8px rhythm with generous narrative breathing room.',
    componentPrinciples: ['Keep route facts scannable', 'Preserve one calm reading path'],
    assetDirection: 'Generate only the reusable illustrated route marker.',
    exploration: {
      mode: 'auto',
      decidedBy: 'agent',
      count: 1,
      rationale: 'The focused route story has one clear visual identity.',
      directions: [{
        id: 'field-guide',
        label: 'Field Guide',
        thesis: 'Make the route feel collected, specific, and calm.',
        vary: ['marker illustration treatment'],
        preserve: ['route legibility', 'place identity'],
      }],
      bounds: { maxCandidates: 8, maxParallelism: 3 },
    },
  },
  pages: [{
    id: 'route-story',
    name: 'Route story',
    route: '/routes/story',
    purpose: 'Read the complete field-notes route and reuse its visual marker.',
    viewport: {
      platform: 'responsive web app',
      width: 1440,
      height: 960,
      scroll: 'single-screen',
    },
    regions: [{
      id: 'route-content',
      name: 'Route narrative',
      role: 'story',
      summary: 'Read the route observations and practical details.',
      complexity: 'medium',
      decompositionStrategy: 'region-crop',
      assetRoute: 'ignore-code-ui',
      assetOpportunities: [],
    }, {
      id: 'route-marker-materials-1-1',
      name: 'Route marker',
      role: 'visual-material',
      summary: 'One reusable illustrated marker for this route.',
      complexity: 'low',
      decompositionStrategy: 'region-crop',
      assetRoute: 'board-cutout',
      assetOpportunities: ['A reusable illustrated marker for the route.'],
    }],
    overlays: [],
    states: [],
    interactions: [],
  }],
  flows: [{
    id: 'read-route',
    name: 'Read route story',
    goal: 'Read the complete route story.',
    startPageId: 'route-story',
    steps: [],
  }],
  reviewDocument: {
    format: 'markdown',
    primaryFlow: '# Field Notes\n\nRead the complete route story.',
    fullPlan: '# Field Notes\n\nOne focused route with one reusable marker.',
  },
  humanLoop: {
    mode: 'continue',
    rationale: 'The focused route, audience, and material need are clear.',
  },
}

function codexPlannerStage(prompt: string): string | null {
  if (prompt.includes('Classify this user turn')) return null
  if (prompt.includes('CUTOUT_OUTLINE_V2')) return 'outline'
  if (prompt.includes("Design System architect")) return 'design-foundation'
  if (prompt.includes('Design System exploration planner')) return 'design-exploration'
  if (prompt.includes('prototype page architect')) return 'page'
  if (prompt.includes('prototype page integrity repairer')) return 'page-repair'
  if (prompt.includes('prototype journey reviewer')) return 'closure'
  if (prompt.includes('prototype journey closure repairer')) return 'closure-repair'
  return 'unknown'
}

function codexTurnOutput(prompt: string): unknown {
  if (prompt.includes('Classify this user turn')) {
    return {
      action: 'proceed',
      reply: null,
      generation: {
        refinedBrief: 'A focused field-notes route with one reusable illustrated marker.',
      },
      clarification: null,
      material: null,
      regeneration: null,
      targetPageNames: null,
    }
  }
  const stage = codexPlannerStage(prompt)
  if (stage === 'outline') return { text: progressiveOutlineProtocol(FIELD_NOTES_PLAN) }
  if (stage === 'design-foundation') {
    const { exploration: _exploration, ...foundation } = FIELD_NOTES_PLAN.designSystem
    return foundation
  }
  if (stage === 'design-exploration') {
    const { bounds: _bounds, ...exploration } = FIELD_NOTES_PLAN.designSystem.exploration!
    return exploration
  }
  if (stage === 'page' || stage === 'page-repair') return FIELD_NOTES_PLAN.pages[0]
  if (stage === 'closure') {
    return {
      flows: FIELD_NOTES_PLAN.flows,
      reviewDocument: FIELD_NOTES_PLAN.reviewDocument,
    }
  }
  if (stage === 'closure-repair') return { flows: FIELD_NOTES_PLAN.flows }
  throw new Error(`Unexpected native Codex Planner stage: ${stage}`)
}

function alternativePlan(
  key: string,
  definitions: readonly [
    readonly [string, string, string],
    readonly [string, string, string],
    readonly [string, string, string],
    readonly [string, string, string],
    readonly [string, string, string],
    readonly [string, string, string],
  ],
): PrototypePlan {
  const [first, second, third, fourth, fifth, sixth] = definitions
  const plannedPages = [
    page(first[0], first[1], first[2], PAGE_MATERIAL_GROUPS[0]!, { id: `${key}-open-${second[0]}`, pageId: second[0] }),
    page(second[0], second[1], second[2], PAGE_MATERIAL_GROUPS[1]!, { id: `${key}-open-${third[0]}`, pageId: third[0] }),
    page(third[0], third[1], third[2], PAGE_MATERIAL_GROUPS[2]!),
    page(fourth[0], fourth[1], fourth[2], PAGE_MATERIAL_GROUPS[3]!, { id: `${key}-open-${fifth[0]}`, pageId: fifth[0] }),
    page(fifth[0], fifth[1], fifth[2], PAGE_MATERIAL_GROUPS[4]!, { id: `${key}-open-${sixth[0]}`, pageId: sixth[0] }),
    page(sixth[0], sixth[1], sixth[2], PAGE_MATERIAL_GROUPS[5]!),
  ]
  return {
    ...AGENT_PLAN,
    pages: plannedPages,
    flows: [
      {
        id: `${key}-primary`,
        name: `${key} planning flow`,
        goal: `Complete the primary ${key} workflow.`,
        startPageId: first[0],
        steps: [
          { fromPageId: first[0], interactionId: `${key}-open-${second[0]}`, toPageId: second[0] },
          { fromPageId: second[0], interactionId: `${key}-open-${third[0]}`, toPageId: third[0] },
        ],
      },
      {
        id: `${key}-secondary`,
        name: `${key} management flow`,
        goal: `Complete the secondary ${key} workflow.`,
        startPageId: fourth[0],
        steps: [
          { fromPageId: fourth[0], interactionId: `${key}-open-${fifth[0]}`, toPageId: fifth[0] },
          { fromPageId: fifth[0], interactionId: `${key}-open-${sixth[0]}`, toPageId: sixth[0] },
        ],
      },
    ],
  }
}

const SUITE_PLANS = [
  alternativePlan('signal', [
    ['overview', 'Overview', '/overview'],
    ['explore', 'Explore', '/explore'],
    ['itinerary', 'Itinerary', '/itinerary/:tripId'],
    ['map', 'Map', '/map'],
    ['budget', 'Budget', '/budget'],
    ['alerts', 'Alerts', '/alerts'],
  ]),
  alternativePlan('workshop', [
    ['workspace', 'Workspace', '/workspace'],
    ['trips', 'Trips', '/workspace/trips'],
    ['trip-board', 'Trip Board', '/workspace/trips/:tripId/board'],
    ['team', 'Team', '/workspace/team'],
    ['roles', 'Roles', '/workspace/team/roles'],
    ['profile', 'Profile', '/profile'],
  ]),
  alternativePlan('editorial', [
    ['journal', 'Journal', '/journal'],
    ['destinations', 'Destinations', '/destinations'],
    ['guide', 'Guide', '/destinations/:slug'],
    ['collection', 'Collection', '/collection'],
    ['schedule', 'Schedule', '/collection/schedule'],
    ['preferences', 'Preferences', '/preferences'],
  ]),
] as const

function progressiveOutlineProtocol(plan: PrototypePlan): string {
  return [
    'CUTOUT_OUTLINE_V2',
    'VERSION\tprototype-plan.v0',
    [
      'PRODUCT',
      plan.product.name,
      plan.product.projectName ?? '-',
      plan.product.summary,
      plan.product.audience,
      plan.product.primaryGoal,
      plan.product.platform,
    ].join('\t'),
    ...plan.pages.map((plannedPage) => [
      'PAGE',
      plannedPage.id,
      plannedPage.name,
      plannedPage.route,
      plannedPage.purpose,
      plannedPage.viewport.platform,
      String(plannedPage.viewport.width),
      String(plannedPage.viewport.height),
      plannedPage.viewport.scroll,
    ].join('\t')),
    ...plan.flows.map(({ startPageId }) => ['ENTRY', startPageId].join('\t')),
    ...plan.pages.flatMap((plannedPage) => plannedPage.interactions.flatMap((interaction) =>
      interaction.action.type === 'navigate'
        ? [[
            'EDGE',
            interaction.id,
            plannedPage.id,
            interaction.action.targetPageId,
            interaction.label,
            interaction.trigger,
            interaction.sourceElement,
            interaction.intent,
          ].join('\t')]
        : [])),
    ['CONTINUE', AGENT_PLAN.humanLoop.rationale].join('\t'),
    'END',
  ].join('\n')
}

function progressiveStage(input: GenerateInput): string | null {
  const system = input.system ?? ''
  if (system.includes("Design System architect")) return 'design-foundation'
  if (system.includes('Design System exploration planner')) return 'design-exploration'
  if (system.includes('prototype page architect')) return 'page'
  if (system.includes('prototype journey reviewer')) return 'closure'
  if (system.includes('prototype route architect')) return 'outline'
  return null
}

function inputText(input: GenerateInput): string {
  return input.input?.flatMap((part) => part.type === 'text' ? [part.text] : []).join('\n') ?? ''
}

function progressivePageFrom(
  input: GenerateInput,
  plan: PrototypePlan,
): PrototypePage | null {
  const text = inputText(input)
  const marker = 'Expand only this exact page outline JSON:\n'
  const target = text.slice(text.lastIndexOf(marker) + marker.length)
  if (!target || !text.includes(marker)) return null
  const parsed = JSON.parse(target) as { id?: string }
  return plan.pages.find((plannedPage) => plannedPage.id === parsed.id) ?? null
}

function alternativePlanFrom(prompt: string): PrototypePlan | null {
  if (prompt.includes('Direction: Editorial Ledger')) return SUITE_PLANS[0]
  if (prompt.includes('Direction: Signal Grid')) return SUITE_PLANS[1]
  if (prompt.includes('Direction: Workshop Console')) return SUITE_PLANS[2]
  return null
}

async function waitForMockImageTool(
  wait: Promise<void>,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (!signal) return wait
  if (signal.aborted) throw new DOMException('Operation aborted', 'AbortError')
  let abort!: () => void
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(new DOMException('Operation aborted', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
  })
  try {
    await Promise.race([wait, aborted])
  } finally {
    signal.removeEventListener('abort', abort)
  }
}

async function generateObject<T>(input: GenerateInput): Promise<Result<T>> {
  if (input.promptRef?.id === 'ui-prototype-planner') {
    const prompt = input.input?.flatMap((part) =>
      part.type === 'text' ? [part.text] : [],
    ).join('\n') ?? ''
    desktopHarness.plannerPrompts.push(prompt)
    const call = desktopHarness.plannerCalls++
    const failure = desktopHarness.plannerFailure?.(call, prompt)
    if (failure) return err(failure)
    const plan = alternativePlanFrom(prompt)
    return plan ? ok(plan as T) : err('Unknown prototype-suite direction in test planner input.')
  }
  const stage = progressiveStage(input)
  if (stage) {
    const prompt = inputText(input)
    const plan = alternativePlanFrom(prompt) ?? AGENT_PLAN
    desktopHarness.progressivePlannerStages.push(stage)
    if (stage === 'outline' && plan !== AGENT_PLAN) {
      desktopHarness.plannerPrompts.push(prompt)
      const call = desktopHarness.plannerCalls++
      const failure = desktopHarness.plannerFailure?.(call, prompt)
      if (failure) return err(failure)
    }
    if (stage === 'design-foundation') {
      const { exploration: _exploration, ...foundation } = plan.designSystem
      return ok(foundation as T)
    }
    if (stage === 'design-exploration') {
      const exploration = plan.designSystem.exploration!
      const { bounds: _bounds, ...decision } = exploration
      return ok(decision as T)
    }
    if (stage === 'page') {
      const plannedPage = progressivePageFrom(input, plan)
      return plannedPage
        ? ok(plannedPage as T)
        : err('Progressive test planner could not resolve the target page.')
    }
    if (stage === 'closure') {
      return ok({
        flows: plan.flows,
        reviewDocument: plan.reviewDocument,
      } as T)
    }
    return ok({
      version: plan.version,
      product: plan.product,
      pages: plan.pages.map((plannedPage) => ({
        id: plannedPage.id,
        name: plannedPage.name,
        route: plannedPage.route,
        purpose: plannedPage.purpose,
        viewport: plannedPage.viewport,
      })),
      entryPageIds: plan.flows.map(({ startPageId }) => startPageId),
      edges: plan.pages.flatMap((plannedPage) => plannedPage.interactions.flatMap(
        (interaction) => interaction.action.type === 'navigate'
          ? [{
              id: interaction.id,
              fromPageId: plannedPage.id,
              toPageId: interaction.action.targetPageId,
              label: interaction.label,
              trigger: interaction.trigger,
              sourceElement: interaction.sourceElement,
              intent: interaction.intent,
            }]
          : [],
      )),
      humanLoop: plan.humanLoop,
    } as T)
  }
  if (input.promptRef?.id === 'ui-generation-qa') {
    const checklist = input.input?.flatMap((part) =>
      part.type === 'text' ? [part.text] : [],
    ).join('\n') ?? ''
    const call = desktopHarness.pageQaCalls++
    return ok((desktopHarness.pageQaVerdict?.(checklist, call) ?? {
      pass: true,
      failures: [],
    }) as T)
  }
  if (input.promptRef?.id === 'ui-slice-naming') {
    const text = input.input?.flatMap((part) => part.type === 'text' ? [part.text] : []).join('\n') ?? ''
    const sliceCount = (text.match(/"index"/g) ?? []).length
    return ok(Array.from({ length: sliceCount }, (_, index) => ({
      index,
      name: `production-asset-${index + 1}`,
    })) as T)
  }
  return err(`Unexpected structured prompt: ${input.promptRef?.id ?? 'none'}`)
}

function fakeRegistry(): ServiceRegistry {
  const notUsed = async (): Promise<never> => {
    throw new Error('not used in this test')
  }
  return {
    cutout: { run: async () => err('not used in this test') },
    foregroundSegmentation: {
      capabilities: async () => ok({ available: false, platform: 'test', backend: 'unavailable', reason: 'capability-required' }),
      segment: async () => err('capability-required'),
    },
    assets: {
      list: async () => ok([]),
      load: notUsed,
      add: notUsed,
      remove: notUsed,
      saveOne: notUsed,
      saveMany: notUsed,
    },
    bundles: { save: notUsed },
    repositorySources: { nativeAvailable: false, selectAndScan: notUsed },
    vectorize: {
      vectorize: notUsed,
      setApiKey: notUsed,
      apiKeyStatus: async () => ok(false),
      deleteApiKey: notUsed,
    },
    providers: {
      list: async () => {
        runtimeConfigHarness.providerLoads += 1
        return runtimeConfigHarness.configured
          ? [{
              id: PROVIDER_ID,
              kind: 'openai' as const,
              label: 'E2E provider',
              wireProtocol: 'responses' as const,
              // The connection advertises exactly what its probe returns —
              // routing is now checked against this catalog, not a default.
              catalog: {
                models: [
                  CHAT_MODEL,
                  desktopHarness.taskFitRouteEnabled ? IMAGE_MODEL : 'image-e2e',
                  ...(desktopHarness.editRouteEnabled ? [EDIT_MODEL] : []),
                ],
                fetchedAt: '2026-08-20T00:00:00.000Z',
              },
              enabled: true,
            }]
          : []
      },
      upsert: notUsed,
      remove: notUsed,
      setKey: notUsed,
      status: async () => ({ hasKey: true }),
      statuses: async (ids) => Object.fromEntries(ids.map((id) => [id, true])),
      test: async () => {
        desktopHarness.providerTests += 1
        return ok({
          models: [
            CHAT_MODEL,
            desktopHarness.taskFitRouteEnabled ? IMAGE_MODEL : 'image-e2e',
            ...(desktopHarness.editRouteEnabled ? [EDIT_MODEL] : []),
          ],
        })
      },
    },
    generation: {
      generateText: async () => {
        desktopHarness.directTextCalls += 1
        return ok(DESIGN_MARKDOWN)
      },
      streamText: async function* (input) {
        const stage = progressiveStage(input)
        if (stage === 'outline') {
          desktopHarness.progressivePlannerStages.push(stage)
          yield progressiveOutlineProtocol(alternativePlanFrom(inputText(input)) ?? AGENT_PLAN)
          return
        }
        yield DESIGN_MARKDOWN
      },
      generateImages: async () => err('not used in this test'),
      editImage: async (input) => {
        expect(input.model).toBe(EDIT_MODEL)
        desktopHarness.boardPrompts.push(input.prompt)
        desktopHarness.activeBoardCalls += 1
        desktopHarness.maximumBoardConcurrency = Math.max(
          desktopHarness.maximumBoardConcurrency,
          desktopHarness.activeBoardCalls,
        )
        try {
          await Promise.resolve()
          const failure = desktopHarness.boardFailure?.(input.prompt)
          if (failure) return err(failure.message)
          const marker = 80 + desktopHarness.boardPrompts.length
          return ok([{
            bytes: new Uint8Array([marker, marker + 1, marker + 2, marker + 3]),
            mediaType: 'image/png',
          }])
        } finally {
          desktopHarness.activeBoardCalls -= 1
        }
      },
      research: async () => err('not used in this test'),
      generateObject,
      generateWithTools: async () => {
        desktopHarness.directToolGateCalls += 1
        return ok({ text: '', toolCalls: [] })
      },
    },
    prompts: {
      list: async () => [],
      versions: notUsed,
      resolve: notUsed,
      render: async () => ({ system: 'test' }),
    },
  }
}

async function waitFor<T>(check: () => T, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let value = check()
  while (!value && Date.now() < deadline) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25))
    })
    value = check()
  }
  return value
}

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

;(globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}

const globalWithBitmap = globalThis as typeof globalThis & {
  createImageBitmap?: () => Promise<{ width: number; height: number; close(): void }>
}
globalWithBitmap.createImageBitmap = async () => ({ width: 1440, height: 960, close() {} })

class OffscreenCanvasStub {
  readonly width: number
  readonly height: number

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }
  getContext() {
    return {
      drawImage() {},
      getImageData: (_x: number, _y: number, width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
      }),
    }
  }
}

;(globalThis as typeof globalThis & { OffscreenCanvas: typeof OffscreenCanvas })
  .OffscreenCanvas = OffscreenCanvasStub as unknown as typeof OffscreenCanvas

describe('brief → every planned route — rendered IntentWorkspace', () => {
  let root: Root | undefined
  let host: HTMLDivElement | undefined

  beforeEach(async () => {
    getStoreState().resetProject()
    verificationStorage.clear()
    desktopHarness.artifacts.clear()
    desktopHarness.contentAddresses.clear()
    desktopHarness.tasks.length = 0
    desktopHarness.imageToolPrompts.length = 0
    desktopHarness.imageToolCallIds.length = 0
    desktopHarness.imageToolSignals.length = 0
    desktopHarness.imageToolReferenceCounts.length = 0
    desktopHarness.imageToolReferenceBytes.length = 0
    desktopHarness.imageToolOutputs.clear()
    desktopHarness.imageToolModels.length = 0
    desktopHarness.imageToolFailure = null
    desktopHarness.imageToolWait = null
    desktopHarness.activeImageCalls = 0
    desktopHarness.maximumImageConcurrency = 0
    desktopHarness.boardPrompts.length = 0
    desktopHarness.boardFailure = null
    desktopHarness.activeBoardCalls = 0
    desktopHarness.maximumBoardConcurrency = 0
    desktopHarness.sliceCoverageOmission = null
    desktopHarness.sliceSequence = 0
    desktopHarness.sequence = 0
    desktopHarness.plannerCalls = 0
    desktopHarness.plannerPrompts.length = 0
    desktopHarness.progressivePlannerStages.length = 0
    desktopHarness.plannerFailure = null
    desktopHarness.pageQaCalls = 0
    desktopHarness.pageQaVerdict = null
    desktopHarness.providerTests = 0
    desktopHarness.directToolGateCalls = 0
    desktopHarness.directTextCalls = 0
    desktopHarness.editRouteEnabled = true
    desktopHarness.taskFitRouteEnabled = true
    codexHarness.enabled = false
    codexHarness.turns = 0
    codexHarness.plannerStages.length = 0
    runtimeConfigHarness.configured = true
    runtimeConfigHarness.providerLoads = 0
    runtimeConfigHarness.assignmentLoads = 0
    runtimeConfigHarness.bindingLoads = 0
    if (!i18n.locale) await activateLocale('en')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    act(() => root?.unmount())
    host?.remove()
    root = undefined
    host = undefined
  })

  function mount(): HTMLDivElement {
    host = document.createElement('div')
    document.body.append(host)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    act(() => {
      root = createRoot(host!)
      root.render(
        <QueryClientProvider client={queryClient}>
          <I18nProvider i18n={i18n}>
            <TooltipProvider>
              <SettingsUIProvider value={{ open: () => {} }}>
                <LibraryUIProvider value={{ open: () => {}, openGlobal: () => {} }}>
                  <ServiceProvider registry={fakeRegistry()}>
                    <ImageImportActionsProvider value={{ openPicker: () => {} }}>
                      <IntentWorkspace />
                    </ImageImportActionsProvider>
                  </ServiceProvider>
                </LibraryUIProvider>
              </SettingsUIProvider>
            </TooltipProvider>
          </I18nProvider>
        </QueryClientProvider>,
      )
    })
    return host
  }

  it('uses the vision binding for Codex-planned QA and locally retries a transient direct asset', async () => {
    codexHarness.enabled = true
    let directFailureInjected = false
    desktopHarness.boardFailure = () => {
      if (directFailureInjected) return null
      directFailureInjected = true
      return new Error('HTTP 502 bad gateway')
    }
    const node = mount()
    const textarea = await waitFor(
      () => node.querySelector<HTMLTextAreaElement>('[aria-label="Message the Agent"]'),
    )
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea, 'Create a focused field-notes experience and produce its reusable visual material.')
      textarea!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      node.querySelector<HTMLButtonElement>('[aria-label="Send"]')!.click()
    })

    const snapshot = await waitFor(() => {
      const current = getStoreState().workspaceSnapshot
      return current?.prototypePages.length === 1 &&
        Object.values(getStoreState().assetProduction.runs).some(
          ({ status }) => status === 'completed',
        ) && !current.runError
        ? current
        : null
    }, 30_000)

    expect(snapshot).toBeTruthy()
    expect(snapshot!.runError).toBeNull()
    // Closure is now compiled from the authoritative outline, so it does not
    // consume a sixth Provider turn.
    expect(codexHarness.turns).toBe(5)
    expect(codexHarness.plannerStages).toEqual([
      'outline',
      'design-foundation',
      'design-exploration',
      'page',
    ])
    expect(desktopHarness.directToolGateCalls).toBe(0)
    expect(desktopHarness.plannerCalls).toBe(0)
    expect(desktopHarness.directTextCalls).toBe(0)
    expect(desktopHarness.providerTests).toBeGreaterThan(0)
    expect(desktopHarness.imageToolCallIds).toEqual(expect.arrayContaining([
      expect.stringMatching(/:design-system:/),
      expect.stringMatching(/:prototype-page:/),
    ]))
    expect(directFailureInjected).toBe(true)
    expect(desktopHarness.boardPrompts).toEqual([
      expect.stringContaining('A reusable illustrated marker for the route.'),
      expect.stringContaining('A reusable illustrated marker for the route.'),
    ])
    const productionRuns = Object.values(getStoreState().assetProduction.runs)
    expect(productionRuns).toHaveLength(1)
    expect(productionRuns[0]).toMatchObject({ status: 'completed' })
    expect(Object.values(productionRuns[0]!.tasks)).toEqual([
      expect.objectContaining({ status: 'ready' }),
    ])
    expect(snapshot!.prototypePages[0]!.review).toMatchObject({
      reviewer: { providerId: PROVIDER_ID, model: CHAT_MODEL },
      verdict: { pass: true },
    })
    expect(snapshot!.prototypePlan?.pages.map((page) => page.route))
      .toEqual(['/routes/story'])
  }, 60_000)

  it('loads one authoritative runtime snapshot when AI setup changes after queries mounted', async () => {
    codexHarness.enabled = true
    runtimeConfigHarness.configured = false
    const node = mount()
    const textarea = await waitFor(
      () => node.querySelector<HTMLTextAreaElement>('[aria-label="Message the Agent"]'),
    )
    await waitFor(() => runtimeConfigHarness.providerLoads > 0
      && runtimeConfigHarness.assignmentLoads > 0
      && runtimeConfigHarness.bindingLoads > 0)
    const cachedLoads = {
      providers: runtimeConfigHarness.providerLoads,
      assignments: runtimeConfigHarness.assignmentLoads,
      bindings: runtimeConfigHarness.bindingLoads,
    }

    // Automatic setup updates the native/local stores after the workspace
    // queries mounted. Deliberately do not invalidate the stale empty cache.
    runtimeConfigHarness.configured = true
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea, 'Create a focused field-notes experience and produce its reusable visual material.')
      textarea!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      node.querySelector<HTMLButtonElement>('[aria-label="Send"]')!.click()
    })

    const snapshot = await waitFor(() => {
      const current = getStoreState().workspaceSnapshot
      return current?.prototypePages.length === 1
        && Object.values(getStoreState().assetProduction.runs).some(
          ({ status }) => status === 'completed',
        )
        && !current.runError
        ? current
        : null
    }, 30_000)

    expect(snapshot).toBeTruthy()
    expect(runtimeConfigHarness.providerLoads).toBeGreaterThan(cachedLoads.providers)
    expect(runtimeConfigHarness.bindingLoads).toBeGreaterThan(cachedLoads.bindings)
    expect(runtimeConfigHarness.assignmentLoads).toBe(cachedLoads.assignments)
    expect(codexHarness.turns).toBe(5)
    expect(codexHarness.plannerStages).toEqual([
      'outline',
      'design-foundation',
      'design-exploration',
      'page',
    ])
    expect(desktopHarness.imageToolCallIds).toEqual(expect.arrayContaining([
      expect.stringMatching(/:design-system:/),
      expect.stringMatching(/:prototype-page:/),
    ]))
    expect(desktopHarness.boardPrompts).toEqual([
      expect.stringContaining('A reusable illustrated marker for the route.'),
    ])
  }, 60_000)

  it('fails before Provider prototype generation when no task-fit image route exists', async () => {
    codexHarness.enabled = true
    desktopHarness.editRouteEnabled = false
    desktopHarness.taskFitRouteEnabled = false
    const node = mount()
    const textarea = await waitFor(
      () => node.querySelector<HTMLTextAreaElement>('[aria-label="Message the Agent"]'),
    )
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea, 'Create a focused field-notes experience with a consistent visual system.')
      textarea!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      node.querySelector<HTMLButtonElement>('[aria-label="Send"]')!.click()
    })

    const failed = await waitFor(() => {
      const current = getStoreState().workspaceSnapshot
      return current?.runError?.includes('requires a reviewed gpt-image-2') ? current : null
    }, 30_000)

    expect(failed).toBeTruthy()
    expect(desktopHarness.imageToolCallIds.filter((id) => id.includes(':design-system:')))
      .toHaveLength(0)
    expect(desktopHarness.imageToolCallIds.filter((id) => id.includes(':prototype-page:')))
      .toHaveLength(0)
    expect(failed!.prototypePages).toHaveLength(0)
  }, 30_000)

  it('selects one of three Design Systems, then completes every route and attributable asset', async () => {
    const node = mount()
    const textarea = await waitFor(
      () => node.querySelector<HTMLTextAreaElement>('[aria-label="Message the Agent"]'),
    )
    expect(textarea).toBeTruthy()

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(
        textarea,
        '设计一个零售运营 Web App，需要浏览商品与管理账号设置，并覆盖购物与账户管理两条完整流程。页面与路由结构由你按平台最佳实践决定，直接生成。',
      )
      textarea!.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const send = node.querySelector<HTMLButtonElement>('[aria-label="Send"]')
    expect(send?.disabled).toBe(false)
    await act(async () => {
      send!.click()
    })

    const selectionSnapshot = await waitFor(() => {
      const current = getStoreState().workspaceSnapshot
      const candidates = current?.prototypeDesignSystemCandidates
      return candidates?.set.candidates.every((candidate) => candidate.status === 'ready')
        ? current
        : null
    })
    expect(selectionSnapshot).toBeTruthy()
    expect(selectionSnapshot!.workflowPhase).toBe('design-system-selection')
    expect(selectionSnapshot!.prototypePages).toHaveLength(0)
    expect(selectionSnapshot!.prototypeDesignSystemCandidates?.set.selection).toBeUndefined()
    const designMarkdownStepIds = selectionSnapshot!.agentRunEvents?.events.flatMap(
      (event) => event.type === 'step-started' && event.label === 'Create DESIGN.md'
        ? [event.stepId]
        : [],
    ) ?? []
    expect(designMarkdownStepIds).toHaveLength(0)
    expect(Object.values(
      selectionSnapshot!.prototypeDesignSystemCandidates!.artifacts,
    ).map((artifact) => designSystemMarkdownValidationError(artifact.designMarkdown)))
      .toEqual([null, null, null])
    const designDirectionEvents = selectionSnapshot!.agentRunEvents?.events.filter(
      (event) => 'label' in event && event.label === 'Generate Design System direction',
    ) ?? []
    expect(designDirectionEvents.filter((event) => event.type === 'step-started')).toHaveLength(3)
    expect(designDirectionEvents.filter((event) => event.type === 'step-succeeded')).toHaveLength(3)
    expect(designDirectionEvents.filter((event) => event.type === 'step-failed')).toHaveLength(0)
    expect(desktopHarness.imageToolPrompts).toHaveLength(3)
    expect(desktopHarness.imageToolPrompts).toEqual(expect.arrayContaining([
      expect.stringContaining('Signal Grid'),
      expect.stringContaining('Editorial Ledger'),
      expect.stringContaining('Workshop Console'),
    ]))
    expect(new Set(desktopHarness.imageToolCallIds).size).toBe(3)
    expect(desktopHarness.imageToolSignals).toHaveLength(3)
    expect(desktopHarness.imageToolSignals.every(Boolean)).toBe(true)
    expect(desktopHarness.imageToolCallIds).toEqual(expect.arrayContaining([
      expect.stringMatching(/:design-system:candidate:signal-grid:generate$/),
      expect.stringMatching(/:design-system:candidate:editorial-ledger:generate$/),
      expect.stringMatching(/:design-system:candidate:workshop-console:generate$/),
    ]))

    const selectionButtons = [...node.querySelectorAll<HTMLButtonElement>('button')]
      .filter((button) => button.textContent?.includes('Use this direction'))
    expect(selectionButtons).toHaveLength(3)
    expect(
      node.querySelector<HTMLElement>('[data-testid="workspace-drawer"]')
        ?.classList.contains('hidden'),
    ).toBe(true)
    await act(async () => {
      selectionButtons[1]!.click()
    })
    expect(await waitFor(() => {
      const panel = node.querySelector<HTMLElement>('[data-workspace-panel="agent-drawer"]')
      return panel && !panel.classList.contains('hidden') ? panel : null
    })).toBeTruthy()

    const snapshot = await waitFor(() => {
      const current = getStoreState().workspaceSnapshot
      return current?.prototypeSuiteCandidates?.set.candidates.every(
        (candidate) => candidate.status === 'ready',
      ) && current.prototypeSuiteCandidates.set.selection
        ? current
        : null
    }, 30_000)
    const failedState = getStoreState()
    expect(snapshot, JSON.stringify({
      runError: failedState.workspaceSnapshot?.runError,
      suites: failedState.workspaceSnapshot?.prototypeSuiteCandidates?.set.candidates.map(
        ({ id, status, error }) => ({ id, status, error }),
      ),
      productionRuns: Object.values(failedState.assetProduction.runs).map((run) => ({
        status: run.status,
        tasks: Object.values(run.tasks).reduce<Record<string, number>>((counts, task) => {
          counts[task.status] = (counts[task.status] ?? 0) + 1
          return counts
        }, {}),
      })),
      boardCalls: desktopHarness.boardPrompts.length,
    })).toBeTruthy()
    expect(snapshot!.runError).toBeNull()
    expect(snapshot!.prototypeScope).toBe('full-plan')
    expect(snapshot!.prototypePlan?.pages.map((item) => item.route)).toEqual(
      SUITE_PLANS[0].pages.map((item) => item.route),
    )
    expect(snapshot!.prototypePages.map((item) => item.page.id)).toEqual(
      SUITE_PLANS[0].pages.map((item) => item.id),
    )
    expect(snapshot!.prototypeDesignSystemCandidates?.set.selection).toMatchObject({
      candidateId: 'candidate:editorial-ledger',
      actor: { kind: 'human', id: 'workspace-user' },
    })
    expect(snapshot!.prototypeDesignSystem?.name).toBe('Editorial Ledger')
    expect(snapshot!.prototypeSuiteCandidates?.set.candidates).toHaveLength(3)
    expect(Object.values(snapshot!.prototypeSuiteCandidates!.artifacts)).toHaveLength(3)
    const progressiveStageCounts = desktopHarness.progressivePlannerStages.reduce<Record<string, number>>(
      (counts, stage) => ({ ...counts, [stage]: (counts[stage] ?? 0) + 1 }),
      {},
    )
    expect(progressiveStageCounts).toEqual({
      outline: 8,
      'design-foundation': 4,
      'design-exploration': 4,
      page: 24,
    })
    expect(desktopHarness.plannerPrompts).toHaveLength(3)
    const alternativePrompts = desktopHarness.plannerPrompts
    expect(alternativePrompts).toHaveLength(3)
    expect(alternativePrompts.every((prompt) =>
      prompt.includes('page count independently')
        && prompt.includes("page count is context, not a quota")
        && !/Author exactly \d+ complete/.test(prompt)
    )).toBe(true)
    expect(alternativePrompts.every((prompt) =>
      !prompt.includes('"version":"prototype-route-graph.v1"')
    )).toBe(true)
    expect(new Set(Object.values(snapshot!.prototypeSuiteCandidates!.artifacts).map(
      (artifact) => artifact.plan.pages.map((plannedPage) => plannedPage.route).join('|'),
    )).size).toBe(3)
    expect(Object.values(snapshot!.prototypeSuiteCandidates!.artifacts).every(
      (artifact) => artifact.pages.length === 6
        && artifact.resourcePack.assets.length === MATERIALS_PER_SUITE,
    )).toBe(true)

    const pageCallIndexes = desktopHarness.imageToolCallIds.flatMap(
      (toolCallId, index) => toolCallId.includes(':prototype-page:') ? [index] : [],
    )
    expect(pageCallIndexes).toHaveLength(18)
    expect(new Set(pageCallIndexes.map(
      (index) => desktopHarness.imageToolCallIds[index],
    )).size).toBe(18)
    expect(pageCallIndexes.every(
      (index) => desktopHarness.imageToolCallIds[index]!.endsWith(':attempt-1'),
    )).toBe(true)
    for (const index of pageCallIndexes) {
      const prompt = desktopHarness.imageToolPrompts[index]!
      expect(prompt).toContain('Suite route contract (all planned screens)')
      expect(prompt).toContain('Final DESIGN.md:')
      expect(prompt).toContain('source: planner-design-contract')
      expect(prompt).toContain('tokens:')
      expect(SUITE_PLANS.some((suite) => suite.pages.every(
        (plannedPage) => prompt.includes(`${plannedPage.name}: ${plannedPage.route}`),
      ))).toBe(true)
    }
    expect(pageCallIndexes.map(
      (index) => desktopHarness.imageToolReferenceCounts[index],
    ).filter((count) => count === 1)).toHaveLength(3)
    expect(pageCallIndexes.map(
      (index) => desktopHarness.imageToolReferenceCounts[index],
    ).filter((count) => count === 2)).toHaveLength(15)
    expect(pageCallIndexes.map(
      (index) => desktopHarness.imageToolModels[index],
    )).toEqual(Array(18).fill(EDIT_MODEL))

    const productionState = getStoreState().assetProduction
    const productionRuns = Object.values(productionState.runs)
    expect(productionRuns).toHaveLength(3)
    const expectedBoardCalls = BOARD_GROUPS_PER_SUITE * SUITE_PLANS.length
    const expectedPageCalls = SUITE_PLANS.reduce(
      (total, suite) => total + suite.pages.length,
      0,
    )
    expect(desktopHarness.boardPrompts).toHaveLength(expectedBoardCalls)
    expect(desktopHarness.maximumBoardConcurrency).toBe(3)
    expect(desktopHarness.imageToolPrompts.length + desktopHarness.boardPrompts.length).toBe(
      AGENT_PLAN.designSystem.exploration!.count + expectedPageCalls + expectedBoardCalls,
    )
    for (const productionRun of productionRuns) {
      const productionPlan = productionState.plans[productionRun.planId]!
      const productionTasks = Object.values(productionRun.tasks)
      expect(productionRun.status).toBe('completed')
      expect(productionPlan.tasks).toHaveLength(MATERIALS_PER_SUITE)
      expect(productionTasks).toHaveLength(MATERIALS_PER_SUITE)
      expect(productionTasks.every((task) => task.status === 'ready')).toBe(true)
      expect(productionTasks.every((task) => task.issues.length === 0)).toBe(true)
    }
    const slices = getStoreState().analysis.slices
    expect(slices).toHaveLength(MATERIALS_PER_SUITE)
    expect(slices.every((slice) =>
      Boolean(slice.pageId && slice.assetManifestItemId && slice.productionTaskId && slice.outputArtifactId)
    )).toBe(true)
    expect(slices.every((slice) => slice.included && slice.reviewIssues.length === 0)).toBe(true)

    const initiallySelectedSuiteId = snapshot!.prototypeSuiteCandidates!.set.selection!.candidateId
    const compareSuites = node.querySelector<HTMLButtonElement>(
      '[data-agent-action="compare-prototype-suites"]',
    )
    expect(compareSuites).toBeTruthy()
    await act(async () => {
      compareSuites!.click()
    })
    const alternateSuite = await waitFor(() =>
      [...document.querySelectorAll<HTMLButtonElement>('[data-suite-candidate-action="select"]')]
        .find((button) =>
          !button.disabled && button.dataset.suiteCandidateId !== initiallySelectedSuiteId,
        ),
    )
    await act(async () => {
      alternateSuite!.click()
    })
    const switched = await waitFor(() => {
      const current = getStoreState().workspaceSnapshot
      return current?.prototypeSuiteCandidates?.set.selection?.candidateId ===
        alternateSuite!.dataset.suiteCandidateId
        ? current
        : null
    })
    const selectedArtifact = switched!.prototypeSuiteCandidates!.artifacts[
      alternateSuite!.dataset.suiteCandidateId!
    ]!
    const selectedRunId = selectedArtifact.resourcePack.id.slice('resource-pack:'.length)
    const selectedProduction = getStoreState().assetProduction
    expect(selectedProduction.activeRunId).toBe(selectedRunId)
    expect(selectedProduction.activePlanId).toBe(selectedProduction.runs[selectedRunId]!.planId)
    expect(new Set(getStoreState().analysis.slices.map((slice) => slice.outputArtifactId)))
      .toEqual(new Set(selectedArtifact.resourcePack.assets.map((asset) => asset.artifactId)))
  }, 60_000)

  it('allows ready partial candidates to be selected while failed siblings remain retryable', async () => {
    desktopHarness.imageToolFailure = (toolCallId) =>
      toolCallId.includes('candidate:editorial-ledger')
        ? new Error('HTTP 503 service unavailable')
        : null
    const node = mount()
    const textarea = await waitFor(
      () => node.querySelector<HTMLTextAreaElement>('[aria-label="Message the Agent"]'),
    )
    expect(textarea).toBeTruthy()

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea, 'Design a complete retail operations web app with three directions. Generate it now.')
      textarea!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const send = node.querySelector<HTMLButtonElement>('[aria-label="Send"]')
    await act(async () => {
      send!.click()
    })

    const partial = await waitFor(() => {
      const current = getStoreState().workspaceSnapshot
      const candidates = current?.prototypeDesignSystemCandidates?.set.candidates
      return current?.workflowPhase === 'design-system-selection'
        && candidates?.some(({ status }) => status === 'failed')
        ? current
        : null
    })
    expect(partial).toBeTruthy()
    expect(partial!.workflowPhase).toBe('design-system-selection')
    expect(partial!.prototypeDesignSystemCandidates?.set.selection).toBeUndefined()
    expect(partial!.prototypeDesignSystemCandidates?.set.candidates.map(({ status }) => status))
      .toEqual(['ready', 'failed', 'ready'])
    expect(desktopHarness.imageToolCallIds).toEqual(expect.arrayContaining([
      expect.stringMatching(/candidate:editorial-ledger:generate$/),
      expect.stringMatching(/candidate:editorial-ledger:retry:1:generate$/),
      expect.stringMatching(/candidate:workshop-console:generate$/),
    ]))
    const failedDirectionEvents = partial!.agentRunEvents?.events.filter(
      (event) => 'stepId' in event && typeof event.stepId === 'string'
        && event.stepId.includes('design-system:2:attempt:'),
    ) ?? []
    expect(failedDirectionEvents.filter((event) => event.type === 'step-started'))
      .toHaveLength(2)
    expect(failedDirectionEvents.filter((event) => event.type === 'step-failed'))
      .toHaveLength(2)
    expect(new Set(failedDirectionEvents.flatMap((event) =>
      'stepId' in event ? [event.stepId] : [])))
      .toEqual(new Set([
        expect.stringMatching(/:attempt:1$/),
        expect.stringMatching(/:attempt:2$/),
      ]))
    expect(failedDirectionEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'step-failed',
        detail: expect.stringContaining('will retry once'),
      }),
      expect.objectContaining({
        type: 'step-failed',
        detail: expect.stringContaining('stopped after a bounded attempt'),
      }),
    ]))
    expect(failedDirectionEvents.every((event) => event.eventId.length <= 160)).toBe(true)

    const selectionButtons = [...node.querySelectorAll<HTMLButtonElement>(
      '[data-design-candidate-action="select"]',
    )]
    expect(selectionButtons).toHaveLength(3)
    expect(selectionButtons.filter((button) => !button.disabled)).toHaveLength(2)
    expect(selectionButtons.filter((button) => button.disabled)).toHaveLength(1)
    expect([...node.querySelectorAll<HTMLButtonElement>('button')].some(
      (button) => button.textContent?.trim() === 'Retry' && !button.disabled,
    )).toBe(true)
  })

  it('keeps the Agent approval surface reachable until every Design System direction settles', async () => {
    let releaseThirdDirection!: () => void
    const thirdDirectionBlocked = new Promise<void>((resolve) => {
      releaseThirdDirection = resolve
    })
    let heldThirdDirection = false
    desktopHarness.imageToolWait = async (toolCallId) => {
      if (!heldThirdDirection && toolCallId.includes('candidate:workshop-console:generate')) {
        heldThirdDirection = true
        await thirdDirectionBlocked
      }
    }

    const node = mount()
    const textarea = await waitFor(
      () => node.querySelector<HTMLTextAreaElement>('[aria-label="Message the Agent"]'),
    )
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea, 'Design a complete retail operations web app with three directions. Generate it now.')
      textarea!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      node.querySelector<HTMLButtonElement>('[aria-label="Send"]')!.click()
    })

    const generating = await waitFor(() => {
      const current = getStoreState().workspaceSnapshot
      const statuses = current?.prototypeDesignSystemCandidates?.set.candidates.map(
        ({ status }) => status,
      )
      return heldThirdDirection && statuses?.filter((status) => status === 'ready').length === 2
        && statuses.includes('generating')
        ? current
        : null
    })
    expect(generating).toBeTruthy()
    expect(node.querySelector<HTMLElement>('[data-testid="workspace-drawer"]')
      ?.dataset.workspacePanel).toBe('agent-drawer')
    const selectionButtons = [...node.querySelectorAll<HTMLButtonElement>(
      '[data-design-candidate-action="select"]',
    )]
    expect(selectionButtons).toHaveLength(3)
    expect(selectionButtons.every((button) => button.disabled)).toBe(true)

    releaseThirdDirection()
    await waitFor(() => getStoreState().workspaceSnapshot?.workflowPhase === 'design-system-selection')
    expect([...node.querySelectorAll<HTMLButtonElement>(
      '[data-design-candidate-action="select"]',
    )].filter((button) => !button.disabled)).toHaveLength(3)
  })

  it('preserves a human suite selection while later siblings finish', async () => {
    let releaseLaterSibling!: () => void
    const laterSiblingBlocked = new Promise<void>((resolve) => {
      releaseLaterSibling = resolve
    })
    let releaseResumedSibling!: () => void
    const resumedSiblingBlocked = new Promise<void>((resolve) => {
      releaseResumedSibling = resolve
    })
    let heldLaterSibling = false
    let heldResumedSibling = false
    let laterSiblingPageCalls = 0
    desktopHarness.imageToolWait = async (toolCallId) => {
      if (!toolCallId.includes(':candidate:prototype-suite:1:prototype-page:')) return
      laterSiblingPageCalls += 1
      if (laterSiblingPageCalls === 1) {
        heldLaterSibling = true
        await laterSiblingBlocked
      } else if (laterSiblingPageCalls === 2) {
        heldResumedSibling = true
        await resumedSiblingBlocked
      }
    }

    const node = mount()
    const textarea = await waitFor(
      () => node.querySelector<HTMLTextAreaElement>('[aria-label="Message the Agent"]'),
    )
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea, 'Design a complete retail operations web app with three directions. Generate it now.')
      textarea!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      node.querySelector<HTMLButtonElement>('[aria-label="Send"]')!.click()
    })

    const designSelectionButtons = await waitFor(() => {
      const buttons = [...node.querySelectorAll<HTMLButtonElement>(
        '[data-design-candidate-action="select"]',
      )]
      return buttons.length === 3 ? buttons : null
    })
    await act(async () => {
      designSelectionButtons![1]!.click()
    })

    const generating = await waitFor(() => {
      const current = getStoreState().workspaceSnapshot
      const suites = current?.prototypeSuiteCandidates
      return heldLaterSibling &&
        suites?.set.candidates.find(({ id }) => id === 'candidate:prototype-suite:2')?.status === 'ready' &&
        suites.set.candidates.find(({ id }) => id === 'candidate:prototype-suite:1')?.status === 'generating' &&
        desktopHarness.imageToolCallIds.some((id) =>
          id.includes(':candidate:prototype-suite:3:prototype-page:'))
        ? current
        : null
    }, 30_000)
    expect(generating).toBeTruthy()

    await act(async () => {
      node.querySelector<HTMLButtonElement>(
        '[data-agent-action="compare-prototype-suites"]',
      )!.click()
    })
    const readySuiteButton = await waitFor(() =>
      [...document.querySelectorAll<HTMLButtonElement>('[data-suite-candidate-action="select"]')]
        .find((button) =>
          button.dataset.suiteCandidateId === 'candidate:prototype-suite:2' && !button.disabled,
        ),
    )
    await act(async () => {
      readySuiteButton!.click()
    })
    expect(await waitFor(() => {
      const selection = getStoreState().workspaceSnapshot
        ?.prototypeSuiteCandidates?.set.selection
      return selection?.candidateId === 'candidate:prototype-suite:2' &&
        selection.actor.kind === 'human'
        ? selection
        : null
    })).toBeTruthy()

    releaseLaterSibling()
    await waitFor(() => heldResumedSibling)
    const selectedWhileSiblingRuns = getStoreState().workspaceSnapshot!
    const selectedWhileSiblingRunsArtifact = selectedWhileSiblingRuns
      .prototypeSuiteCandidates!.artifacts['candidate:prototype-suite:2']!
    expect(selectedWhileSiblingRuns.prototypePages).toEqual(
      selectedWhileSiblingRunsArtifact.pages,
    )
    expect(new Set(getStoreState().analysis.slices.map((slice) => slice.outputArtifactId)))
      .toEqual(new Set(
        selectedWhileSiblingRunsArtifact.resourcePack.assets.map((asset) => asset.artifactId),
      ))
    releaseResumedSibling()
    const completed = await waitFor(() => {
      const current = getStoreState().workspaceSnapshot
      return current?.prototypeSuiteCandidates?.set.candidates.every(
        ({ status }) => status === 'ready',
      ) && !current.runError
        ? current
        : null
    }, 30_000)
    expect(completed).toBeTruthy()

    const selectedId = 'candidate:prototype-suite:2'
    const selectedArtifact = completed!.prototypeSuiteCandidates!.artifacts[selectedId]!
    expect(completed!.prototypeSuiteCandidates!.set.selection).toMatchObject({
      candidateId: selectedId,
      actor: { kind: 'human', id: 'workspace-user' },
    })
    expect(completed!.prototypePlan).toEqual(selectedArtifact.plan)
    expect(completed!.prototypeDesignSystem).toEqual(selectedArtifact.designSystem.artifact)
    expect(completed!.prototypePages).toEqual(selectedArtifact.pages)

    const selectedRunId = selectedArtifact.resourcePack.id.slice('resource-pack:'.length)
    expect(getStoreState().assetProduction.activeRunId).toBe(selectedRunId)
    expect(new Set(getStoreState().analysis.slices.map((slice) => slice.outputArtifactId)))
      .toEqual(new Set(selectedArtifact.resourcePack.assets.map((asset) => asset.artifactId)))
    expect(desktopHarness.maximumImageConcurrency).toBeLessThanOrEqual(3)
  }, 60_000)

  it('retries all failed suite frontiers together without replaying ready siblings', async () => {
    vi.stubEnv('VITE_CUTOUT_PACKAGED_E2E', '1')
    const node = mount()
    const textarea = await waitFor(
      () => node.querySelector<HTMLTextAreaElement>('[aria-label="Message the Agent"]'),
    )
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea, 'Design a complete retail operations web app with three directions. Generate it now.')
      textarea!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      node.querySelector<HTMLButtonElement>('[aria-label="Send"]')!.click()
    })

    await waitFor(() => {
      const candidates = getStoreState().workspaceSnapshot?.prototypeDesignSystemCandidates
      return candidates?.set.candidates.every(({ status }) => status === 'ready')
        ? candidates
        : null
    })
    const failedPageSuffixes = new Map<string, string>()
    const failedAttemptCounts = new Map<string, number>()
    desktopHarness.imageToolFailure = (toolCallId) => {
      const candidateId = ['candidate:prototype-suite:2', 'candidate:prototype-suite:3']
        .find((id) => toolCallId.includes(`${id}:prototype-page:`))
      if (!candidateId || toolCallId.includes(':overview:')) return null
      const logicalSuffix = toolCallId
        .slice(toolCallId.indexOf(candidateId))
        .replace(/:attempt-\d+$/, '')
      const targetSuffix = failedPageSuffixes.get(candidateId) ?? logicalSuffix
      failedPageSuffixes.set(candidateId, targetSuffix)
      if (logicalSuffix === targetSuffix) {
        const attempts = failedAttemptCounts.get(candidateId) ?? 0
        const maximumAttempts = candidateId === 'candidate:prototype-suite:2' ? 2 : 1
        if (attempts >= maximumAttempts) return null
        failedAttemptCounts.set(candidateId, attempts + 1)
        return candidateId === 'candidate:prototype-suite:2'
          ? new Error('HTTP 503 service unavailable')
          : new Error('The model returned no image.')
      }
      return null
    }
    const selectionButtons = [...node.querySelectorAll<HTMLButtonElement>(
      '[data-design-candidate-action="select"]',
    )]
    await act(async () => {
      selectionButtons[1]!.click()
    })

    const failed = await waitFor(() => {
      const current = getStoreState().workspaceSnapshot
      return current?.runError && current.prototypeSuiteCandidates?.set.candidates.some(
        ({ status }) => status === 'failed',
      ) ? current : null
    }, 30_000)
    expect(failedPageSuffixes.size).toBe(2)
    expect([...failedPageSuffixes.keys()].every((candidateId) => [
      'candidate:prototype-suite:2',
      'candidate:prototype-suite:3',
    ].includes(candidateId))).toBe(true)
    expect([...failedAttemptCounts.values()].sort()).toEqual([1, 2])
    expect(failed!.prototypePages.length).toBeGreaterThan(0)
    expect(failed!.prototypeSuiteCandidates?.set.candidates.map(({ status }) => status))
      .toEqual(['ready', 'failed', 'failed'])
    expect(Object.values(failed!.prototypeSuiteCandidates!.artifacts)).toHaveLength(1)
    desktopHarness.imageToolFailure = null

    const retry = await waitFor(() =>
      node.querySelector<HTMLButtonElement>('[data-agent-action="retry-run"]:not(:disabled)'))
    expect(retry, JSON.stringify({
      runError: getStoreState().workspaceSnapshot?.runError,
      working: node.querySelector<HTMLElement>('[data-workspace-root]')?.dataset.agentWorking,
      suiteStatuses: getStoreState().workspaceSnapshot?.prototypeSuiteCandidates?.set.candidates
        .map(({ status }) => status),
    })).toBeTruthy()
    act(() => {
      retry!.click()
    })
    expect(node.querySelector<HTMLElement>('[data-workspace-root]')?.dataset.agentWorking)
      .toBe('true')

    const recovered = await waitFor(() => {
      const current = getStoreState().workspaceSnapshot
      return current?.prototypeSuiteCandidates?.set.candidates.every(
        ({ status }) => status === 'ready',
      ) && current.prototypeSuiteCandidates.set.selection && !current.runError
        ? current
        : null
    }, 30_000)
    const finalState = getStoreState().workspaceSnapshot
    expect(recovered, JSON.stringify({
      runError: finalState?.runError,
      workflowPhase: finalState?.workflowPhase,
      suiteStatuses: finalState?.prototypeSuiteCandidates?.set.candidates.map(
        ({ id, status, error }) => ({ id, status, error }),
      ),
      artifactIds: Object.keys(finalState?.prototypeSuiteCandidates?.artifacts ?? {}),
      pageCount: finalState?.prototypePages.length,
      productionRuns: Object.values(getStoreState().assetProduction.runs).map((run) => ({
        id: run.runId,
        status: run.status,
        tasks: Object.values(run.tasks).map((task) => ({
          status: task.status,
          issues: task.issues.map((issue) => issue.message),
        })),
      })),
    })).toBeTruthy()
    expect(recovered!.prototypeSuiteCandidates?.set.candidates).toHaveLength(3)
    expect(Object.values(recovered!.prototypeSuiteCandidates!.artifacts)).toHaveLength(3)

    const pageCalls = desktopHarness.imageToolCallIds.filter((id) =>
      id.includes(':prototype-page:'))
    const designSystemCalls = desktopHarness.imageToolCallIds.filter((id) =>
      id.includes(':design-system:'))
    const repeatedPageCalls = [...failedAttemptCounts.values()]
      .reduce((total, attempts) => total + attempts, 0)
    expect(pageCalls).toHaveLength(18 + repeatedPageCalls)
    expect(designSystemCalls).toHaveLength(3)
    for (const [candidateId, suffix] of failedPageSuffixes) {
      expect(pageCalls.filter((id) => id.includes(suffix))).toHaveLength(
        (failedAttemptCounts.get(candidateId) ?? 0) + 1,
      )
    }
    const expectedCalls = compilePrototypeImageRequestBudget({
      designSystemCalls: 3,
      suites: SUITE_PLANS,
    }).totalCalls + repeatedPageCalls
    const workspaceRoot = node.querySelector<HTMLElement>('[data-workspace-root]')
    expect(workspaceRoot?.dataset.packagedE2eImageCallCount).toBe(String(expectedCalls))
    expect(workspaceRoot?.dataset.packagedE2ePlannedImageCallCount).toBe(String(expectedCalls))
    expect(workspaceRoot?.dataset.packagedE2eRetryImageCallCount).toBe(String(repeatedPageCalls))
    expect(workspaceRoot?.dataset.packagedE2eRetryStartCount).toBe('1')
  }, 60_000)

  it('replans a failed candidate when no reusable suite frontier exists yet', async () => {
    const node = mount()
    const textarea = await waitFor(
      () => node.querySelector<HTMLTextAreaElement>('[aria-label="Message the Agent"]'),
    )
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea, 'Design a complete retail operations web app with three directions. Generate it now.')
      textarea!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      node.querySelector<HTMLButtonElement>('[aria-label="Send"]')!.click()
    })

    await waitFor(() => {
      const candidates = getStoreState().workspaceSnapshot?.prototypeDesignSystemCandidates
      return candidates?.set.candidates.every(({ status }) => status === 'ready')
        ? candidates
        : null
    })
    let failedPlanningOnce = false
    desktopHarness.plannerFailure = (_call, prompt) => {
      if (!prompt.includes('Direction: Editorial Ledger') || failedPlanningOnce) return null
      failedPlanningOnce = true
      return 'HTTP 503 service unavailable'
    }
    const selectionButtons = [...node.querySelectorAll<HTMLButtonElement>(
      '[data-design-candidate-action="select"]',
    )]
    await act(async () => {
      selectionButtons[1]!.click()
    })

    const failed = await waitFor(() => {
      const current = getStoreState().workspaceSnapshot
      return current?.runError && current.prototypeSuiteCandidates?.set.candidates.some(
        ({ status }) => status === 'failed',
      ) ? current : null
    }, 30_000)
    expect(failedPlanningOnce).toBe(true)
    expect(failed!.prototypeSuiteCandidates?.set.candidates.map(({ status }) => status))
      .toEqual(['ready', 'failed', 'ready'])
    expect(Object.values(failed!.prototypeSuiteCandidates!.artifacts)).toHaveLength(2)
    expect(desktopHarness.plannerPrompts).toHaveLength(3)
    desktopHarness.plannerFailure = null

    const retry = await waitFor(() =>
      node.querySelector<HTMLButtonElement>('[data-agent-action="retry-run"]:not(:disabled)'))
    act(() => {
      retry!.click()
    })
    const recovered = await waitFor(() => {
      const current = getStoreState().workspaceSnapshot
      return current?.prototypeSuiteCandidates?.set.candidates.every(
        ({ status }) => status === 'ready',
      ) && current.prototypeSuiteCandidates.set.selection && !current.runError
        ? current
        : null
    }, 30_000)

    expect(recovered).toBeTruthy()
    expect(desktopHarness.plannerPrompts).toHaveLength(4)
    expect(Object.values(recovered!.prototypeSuiteCandidates!.artifacts)).toHaveLength(3)
    expect(new Set(Object.values(recovered!.prototypeSuiteCandidates!.artifacts).map(
      (artifact) => artifact.plan.pages.map((page) => page.route).join('|'),
    )).size).toBe(3)
    expect(recovered!.prototypePlan?.pages.map((page) => page.route)).toEqual(
      SUITE_PLANS[0].pages.map((page) => page.route),
    )
    expect(desktopHarness.imageToolCallIds.filter((id) => id.includes(':prototype-page:')))
      .toHaveLength(18)
  }, 60_000)

  it('edits the latest rejected page across local and suite Retry without replaying accepted pages', async () => {
    const node = mount()
    const textarea = await waitFor(
      () => node.querySelector<HTMLTextAreaElement>('[aria-label="Message the Agent"]'),
    )
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea, 'Design a complete travel operations web app with several directions. Generate it now.')
      textarea!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      node.querySelector<HTMLButtonElement>('[aria-label="Send"]')!.click()
    })

    await waitFor(() => {
      const candidates = getStoreState().workspaceSnapshot?.prototypeDesignSystemCandidates
      return candidates?.set.candidates.every(({ status }) => status === 'ready')
        ? candidates
        : null
    })
    let targetReviews = 0
    desktopHarness.pageQaVerdict = (checklist) => {
      if (!checklist.includes('Primary content for workspace')) {
        return { pass: true, failures: [] }
      }
      targetReviews += 1
      return targetReviews <= 2
        ? {
            pass: false,
            failures: [
              'Keep the complete comparison rail. Bearer secret-token sk-123456789abcdef /Users/test/private.png',
            ],
          }
        : { pass: true, failures: [] }
    }
    const selectionButtons = [...node.querySelectorAll<HTMLButtonElement>(
      '[data-design-candidate-action="select"]',
    )]
    await act(async () => {
      selectionButtons[1]!.click()
    })

    await waitFor(() => {
      const current = getStoreState().workspaceSnapshot
      return current?.runError && current.prototypeSuiteCandidates?.set.candidates.some(
        ({ status }) => status === 'failed',
      ) ? current : null
    }, 30_000)
    const targetCallsBeforeRetry = desktopHarness.imageToolCallIds.filter((id) =>
      id.includes(':prototype-page:workspace:'))
    expect(targetCallsBeforeRetry).toHaveLength(2)
    const secondTargetIndex = desktopHarness.imageToolCallIds.indexOf(targetCallsBeforeRetry[1]!)
    expect(desktopHarness.imageToolReferenceBytes[secondTargetIndex]?.[0]).toEqual(
      desktopHarness.imageToolOutputs.get(targetCallsBeforeRetry[0]!),
    )
    expect(desktopHarness.imageToolReferenceCounts[secondTargetIndex]).toBe(2)
    expect(desktopHarness.imageToolPrompts[secondTargetIndex]).toContain('<redacted>')
    expect(desktopHarness.imageToolPrompts[secondTargetIndex]).toContain('<local-path>')
    expect(desktopHarness.imageToolPrompts[secondTargetIndex]).not.toContain('secret-token')

    const failedCandidateId = targetCallsBeforeRetry[0]!.match(
      /candidate:prototype-suite:\d+/,
    )?.[0]
    expect(failedCandidateId).toBeTruthy()
    const acceptedSiblingCallsBeforeRetry = desktopHarness.imageToolCallIds.filter((id) =>
      id.includes(`${failedCandidateId}:prototype-page:trips:`))
    expect(acceptedSiblingCallsBeforeRetry).toHaveLength(1)

    const retry = await waitFor(() =>
      node.querySelector<HTMLButtonElement>('[data-agent-action="retry-run"]:not(:disabled)'))
    act(() => {
      retry!.click()
    })
    const recovered = await waitFor(() => {
      const current = getStoreState().workspaceSnapshot
      return current?.prototypeSuiteCandidates?.set.candidates.every(
        ({ status }) => status === 'ready',
      ) && !current.runError ? current : null
    }, 30_000)

    expect(recovered).toBeTruthy()
    const targetCalls = desktopHarness.imageToolCallIds.filter((id) =>
      id.includes(':prototype-page:workspace:'))
    expect(targetCalls).toHaveLength(3)
    const resumedTargetIndex = desktopHarness.imageToolCallIds.indexOf(targetCalls[2]!)
    expect(desktopHarness.imageToolReferenceBytes[resumedTargetIndex]?.[0]).toEqual(
      desktopHarness.imageToolOutputs.get(targetCalls[1]!),
    )
    expect(desktopHarness.imageToolReferenceCounts[resumedTargetIndex]).toBe(2)
    expect(desktopHarness.imageToolReferenceCounts[resumedTargetIndex]).toBeLessThanOrEqual(3)
    expect(desktopHarness.imageToolPrompts[resumedTargetIndex]).toContain('complete comparison rail')
    expect(desktopHarness.imageToolCallIds.filter((id) =>
      id.includes(`${failedCandidateId}:prototype-page:trips:`))).toEqual(
      acceptedSiblingCallsBeforeRetry,
    )

    const reviewEvents = (recovered!.agentRunEvents?.events ?? []).filter((event) =>
      'pageId' in event && event.pageId === 'workspace')
    expect(reviewEvents.filter(({ type }) => type === 'prototype-page-review-started'))
      .toHaveLength(3)
    expect(reviewEvents.filter(({ type }) => type === 'prototype-page-review-rejected'))
      .toHaveLength(2)
    expect(reviewEvents.filter(({ type }) => type === 'prototype-page-review-passed'))
      .toHaveLength(1)
    expect(JSON.stringify(reviewEvents)).not.toContain('secret-token')
    expect(JSON.stringify(reviewEvents)).not.toContain('/Users/test')
  }, 60_000)

  it('blocks omitted slice foreground and retries only that needs-review region', async () => {
    const node = mount()
    const textarea = await waitFor(
      () => node.querySelector<HTMLTextAreaElement>('[aria-label="Message the Agent"]'),
    )
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea, 'Design a complete retail operations web app with three directions. Generate it now.')
      textarea!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      node.querySelector<HTMLButtonElement>('[aria-label="Send"]')!.click()
    })

    await waitFor(() => {
      const candidates = getStoreState().workspaceSnapshot?.prototypeDesignSystemCandidates
      return candidates?.set.candidates.every(({ status }) => status === 'ready')
        ? candidates
        : null
    })
    const targetRegionId = SUITE_PLANS[1]!.pages
      .flatMap((page) => page.regions)
      .find((region) => region.assetRoute === 'board-cutout')!.id
    let omittedOnce = false
    desktopHarness.sliceCoverageOmission = (regionId) => {
      if (omittedOnce || regionId !== targetRegionId) return false
      omittedOnce = true
      return true
    }
    const selectionButtons = [...node.querySelectorAll<HTMLButtonElement>(
      '[data-design-candidate-action="select"]',
    )]
    await act(async () => {
      selectionButtons[1]!.click()
    })

    const failed = await waitFor(() => {
      const current = getStoreState().workspaceSnapshot
      return current?.runError && current.prototypeSuiteCandidates?.set.candidates.some(
        ({ status }) => status === 'failed',
      ) ? current : null
    }, 30_000)
    expect(omittedOnce).toBe(true)
    expect(Object.values(failed!.prototypeSuiteCandidates!.artifacts)).toHaveLength(2)
    const reviewRun = await waitFor(() => {
      const run = Object.values(getStoreState().assetProduction.runs)
        .find(({ tasks }) => Object.values(tasks).some((task) => task.issues.some(
          (issue) => issue.code === 'slice-foreground-omitted',
        )))
      return run?.status === 'cancelled' ? run : null
    }, 30_000)
    const reviewTask = Object.values(reviewRun?.tasks ?? {}).find((task) =>
      task.issues.some((issue) => issue.code === 'slice-foreground-omitted'))
    expect(reviewRun?.status).toBe('cancelled')
    expect(reviewTask).toMatchObject({
      status: 'needs-review',
      candidate: expect.objectContaining({ mediaType: 'image/png' }),
    })
    const pageCallsBeforeRetry = desktopHarness.imageToolCallIds.filter((id) =>
      id.includes(':prototype-page:'))
    const boardCallsBeforeRetry = desktopHarness.boardPrompts.length
    desktopHarness.sliceCoverageOmission = null

    const retry = await waitFor(() =>
      node.querySelector<HTMLButtonElement>('[data-agent-action="retry-run"]:not(:disabled)'))
    act(() => {
      retry!.click()
    })
    const recovered = await waitFor(() => {
      const current = getStoreState().workspaceSnapshot
      return current?.prototypeSuiteCandidates?.set.candidates.every(
        ({ status }) => status === 'ready',
      ) && !current.runError ? current : null
    }, 30_000)

    expect(recovered).toBeTruthy()
    expect(desktopHarness.imageToolCallIds.filter((id) => id.includes(':prototype-page:')))
      .toEqual(pageCallsBeforeRetry)
    expect(desktopHarness.boardPrompts).toHaveLength(boardCallsBeforeRetry + 1)
    expect(Object.values(getStoreState().assetProduction.runs).filter(
      ({ status }) => status === 'completed',
    )).toHaveLength(3)
  }, 60_000)

  it('retries one transient material board locally without replaying ready pages or siblings', async () => {
    vi.stubEnv('VITE_CUTOUT_PACKAGED_E2E', '1')
    const node = mount()
    const textarea = await waitFor(
      () => node.querySelector<HTMLTextAreaElement>('[aria-label="Message the Agent"]'),
    )
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea, 'Design a complete retail operations web app with three directions. Generate it now.')
      textarea!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      node.querySelector<HTMLButtonElement>('[aria-label="Send"]')!.click()
    })

    await waitFor(() => {
      const candidates = getStoreState().workspaceSnapshot?.prototypeDesignSystemCandidates
      return candidates?.set.candidates.every(({ status }) => status === 'ready')
        ? candidates
        : null
    })
    let failedOnce = false
    let failedBoardPrompt: string | null = null
    desktopHarness.boardFailure = (prompt) => {
      if (
        failedOnce
        || desktopHarness.boardPrompts.length <= BOARD_GROUPS_PER_SUITE
      ) return null
      failedOnce = true
      failedBoardPrompt = prompt
      return new Error('HTTP 503 service unavailable')
    }
    const selectionButtons = [...node.querySelectorAll<HTMLButtonElement>(
      '[data-design-candidate-action="select"]',
    )]
    await act(async () => {
      selectionButtons[1]!.click()
    })

    const recovered = await waitFor(() => {
      const current = getStoreState().workspaceSnapshot
      return current?.prototypeSuiteCandidates?.set.candidates.every(
        ({ status }) => status === 'ready',
      ) && current.prototypeSuiteCandidates.set.selection && !current.runError
        ? current
        : null
    }, 30_000)
    expect(recovered).toBeTruthy()
    expect(failedOnce).toBe(true)
    expect(recovered!.prototypePages).toHaveLength(6)
    expect(desktopHarness.imageToolCallIds.filter((id) =>
      id.includes(':prototype-page:'))).toHaveLength(18)
    expect(desktopHarness.boardPrompts).toHaveLength(BOARD_GROUPS_PER_SUITE * 3 + 1)
    expect(Object.values(recovered!.prototypeSuiteCandidates!.artifacts)).toHaveLength(3)
    expect(failedBoardPrompt).toBeTruthy()
    const pageCallIdsAfterRetry = desktopHarness.imageToolCallIds.filter((id) =>
      id.includes(':prototype-page:'))
    const resolvedBudget = compilePrototypeImageRequestBudget({
      designSystemCalls: 3,
      suites: SUITE_PLANS,
    })
    const expectedImageCallsWithRetry = resolvedBudget.totalCalls + 1
    expect(pageCallIdsAfterRetry).toHaveLength(resolvedBudget.pageCalls)
    expect(new Set(pageCallIdsAfterRetry).size).toBe(pageCallIdsAfterRetry.length)
    expect(pageCallIdsAfterRetry.every((id) => id.endsWith(':attempt-1'))).toBe(true)
    expect(desktopHarness.boardPrompts).toHaveLength(resolvedBudget.boardCalls + 1)
    expect(desktopHarness.boardPrompts.filter((prompt) => prompt === failedBoardPrompt))
      .toHaveLength(2)

    const workspaceRoot = await waitFor(() => {
      const current = node.querySelector<HTMLElement>('[data-workspace-root]')
      return current?.dataset.packagedE2eImageCallCount === String(expectedImageCallsWithRetry)
        && current.dataset.packagedE2ePlannedImageCallCount === String(expectedImageCallsWithRetry)
        ? current
        : null
    })
    expect(workspaceRoot).toBeTruthy()
    expect(workspaceRoot!.dataset.packagedE2ePlanningTurnCount).toBe('1')
    expect(workspaceRoot!.dataset.packagedE2eCodexPlanningTurnCount).toBe('0')
    expect(workspaceRoot!.dataset.packagedE2eDirectPlanningTurnCount).toBe('1')
    expect(workspaceRoot!.dataset.packagedE2eRetryImageCallCount).toBe('1')
    expect(workspaceRoot!.dataset.packagedE2eRetryStartCount).toBe('0')
    const productionRuns = Object.values(getStoreState().assetProduction.runs)
    expect(productionRuns.filter(({ status }) => status === 'partial')).toHaveLength(0)
    expect(productionRuns.filter(({ status }) => status === 'cancelled')).toHaveLength(0)
    expect(productionRuns.filter(({ status }) => status === 'completed')).toHaveLength(3)
  }, 60_000)
})
