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
import type { PrototypePage, PrototypePlan } from '@/prototype/prototype-plan'
import type { VisualGenerationTask } from '@/visual-generation'
import { IntentWorkspace } from './IntentWorkspace'
import { installE2eLocalStorage } from './intent-workspace.e2e.testkit'

const PROVIDER_ID = 'provider:e2e'
const CHAT_MODEL = 'chat-e2e'
const IMAGE_MODEL = 'image-e2e'

const desktopHarness = vi.hoisted(() => ({
  artifacts: new Map<string, { bytes: Uint8Array; mediaType: string }>(),
  contentAddresses: new Map<string, string>(),
  tasks: [] as VisualGenerationTask[],
  sequence: 0,
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

vi.mock('@/services/ai/model-assignment.local', () => ({
  loadAssignments: async (): Promise<ModelAssignments> => ({
    chat: { providerId: PROVIDER_ID, model: CHAT_MODEL },
    image: { providerId: PROVIDER_ID, model: IMAGE_MODEL },
  }),
  setAssignment: async () => ({}),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async () => {
    throw new Error('Tauri invoke is not available in this component E2E test')
  },
  Channel: class {},
}))

vi.mock('@/agent-runtime/use-desktop-tool-loop', () => ({
  useDesktopToolLoop: () => ({
    loop: {
      approve: async () => {},
      deny: () => {},
      cancel: () => {},
      retry: async () => {},
    },
    invoke: async () => [
      { bytes: new Uint8Array([1, 2, 3, 4]), mediaType: 'image/png' },
    ],
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
    visualBudget: () => ({
      ceiling: { currency: 'USD' as const, amount: 0.08 },
    }),
  }),
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

function region(pageId: string): PrototypePage['regions'][number] {
  return {
    id: `${pageId}-content`,
    name: 'Route content',
    role: 'main',
    summary: `Primary content for ${pageId}`,
    complexity: 'medium',
    decompositionStrategy: 'direct',
    assetRoute: 'ignore-code-ui',
    assetOpportunities: [],
  }
}

function page(
  id: string,
  name: string,
  route: string,
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
    regions: [region(id)],
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
    assetDirection: 'Keep code-reproducible UI as ordinary interface elements.',
  },
  pages: [
    page('home', 'Home', '/', { id: 'open-catalog', pageId: 'catalog' }),
    page('catalog', 'Catalog', '/catalog'),
    page('account', 'Account', '/account', { id: 'open-settings', pageId: 'settings' }),
    page('settings', 'Settings', '/settings'),
  ],
  flows: [
    {
      id: 'shopping',
      name: 'Shopping flow',
      goal: 'Move from home to catalog.',
      startPageId: 'home',
      steps: [{ fromPageId: 'home', interactionId: 'open-catalog', toPageId: 'catalog' }],
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

async function generateObject<T>(input: GenerateInput): Promise<Result<T>> {
  if (input.promptRef?.id === 'ui-prototype-planner') return ok(AGENT_PLAN as T)
  if (input.promptRef?.id === 'ui-generation-qa') {
    return ok({ pass: true, failures: [] } as T)
  }
  return err(`Unexpected structured prompt: ${input.promptRef?.id ?? 'none'}`)
}

function fakeRegistry(): ServiceRegistry {
  const notUsed = async (): Promise<never> => {
    throw new Error('not used in this test')
  }
  return {
    session: { current: async () => ({ userId: 'test', isAuthenticated: false }) },
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
      list: async () => [{
        id: PROVIDER_ID,
        kind: 'openai',
        label: 'E2E provider',
        defaultModel: CHAT_MODEL,
        enabled: true,
      }],
      upsert: notUsed,
      remove: notUsed,
      setKey: notUsed,
      status: async () => ({ hasKey: true }),
      statuses: async (ids) => Object.fromEntries(ids.map((id) => [id, true])),
      test: async () => ok({ model: CHAT_MODEL }),
    },
    generation: {
      generateText: async () => ok(DESIGN_MARKDOWN),
      streamText: async function* () {
        yield DESIGN_MARKDOWN
      },
      generateImages: async () => err('not used in this test'),
      editImage: async () => err('not used in this test'),
      research: async () => err('not used in this test'),
      generateObject,
      generateWithTools: async () => ok({ text: '', toolCalls: [] }),
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

describe('brief → every planned route — rendered IntentWorkspace', () => {
  let root: Root | undefined
  let host: HTMLDivElement | undefined

  beforeEach(async () => {
    getStoreState().resetProject()
    verificationStorage.clear()
    desktopHarness.artifacts.clear()
    desktopHarness.contentAddresses.clear()
    desktopHarness.tasks.length = 0
    desktopHarness.sequence = 0
    if (!i18n.locale) await activateLocale('en')
  })

  afterEach(() => {
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

  it('generates all routes across independent flows with one stable visual anchor', async () => {
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

    const snapshot = await waitFor(() => {
      const current = getStoreState().workspaceSnapshot
      return current?.prototypePages.length === AGENT_PLAN.pages.length ? current : null
    })
    expect(snapshot).toBeTruthy()
    expect(snapshot!.runError).toBeNull()
    expect(snapshot!.prototypeScope).toBe('full-plan')
    expect(snapshot!.prototypePlan?.pages.map((item) => item.route)).toEqual(
      AGENT_PLAN.pages.map((item) => item.route),
    )
    expect(snapshot!.prototypePages.map((item) => item.page.id)).toEqual(
      AGENT_PLAN.pages.map((item) => item.id),
    )

    expect(desktopHarness.tasks).toHaveLength(4)
    const [anchor, ...followers] = desktopHarness.tasks
    expect(anchor!.catalogItemId).toBe('prototype.page.home')
    expect(anchor!.references).toHaveLength(1)
    expect(followers).toHaveLength(3)
    const anchorReferenceId = followers[0]!.references[1]!.artifactId
    for (const task of followers) {
      expect(task.references).toHaveLength(2)
      expect(task.references[0]!.artifactId).toBe(anchor!.references[0]!.artifactId)
      expect(task.references[1]!.artifactId).toBe(anchorReferenceId)
    }

    expect(desktopHarness.tasks.map((task) => task.consistency.serial)).toEqual([0, 1, 2, 3])
    expect(new Set(desktopHarness.tasks.map((task) => task.consistency.seriesId))).toEqual(
      new Set(['prototype:Atlas']),
    )
    for (const task of desktopHarness.tasks) {
      expect(task.budget).toMatchObject({
        approvalPolicy: 'explicit',
        ceiling: { currency: 'USD', amount: 0.08 },
      })
      expect(task.prompt.objective).toContain('Suite route contract (all planned screens)')
      expect(task.prompt.objective).toContain('Final DESIGN.md:')
      expect(task.prompt.objective).toContain(
        'Use one quiet navigation shell, stable typography, and consistent controls across every route.',
      )
      for (const plannedPage of AGENT_PLAN.pages) {
        expect(task.prompt.objective).toContain(`${plannedPage.name}: ${plannedPage.route}`)
      }
      expect(task.prompt.objective).toContain('Account management flow')
    }
  }, 20_000)
})
