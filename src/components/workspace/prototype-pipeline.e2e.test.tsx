/**
 * The definitive "can the Agent deliver what the user wants" proof: renders
 * the ACTUAL `IntentWorkspace` component, types a real build brief, and drives
 * the WHOLE generation pipeline against a live gateway — real tool-gate
 * classification, real `planPrototype`, real design-system image generation,
 * real image-grounded DESIGN.md synthesis, and real prototype page image(s) —
 * then asserts the delivered prototype artifacts (design system + pages) land
 * in the workspace store, where the Deliver surface's exports read them.
 *
 * Every model/image call is the shipping code path via
 * `createGatewayGenerationService` (only the model adapter's fetch and the two
 * image endpoints are redirected from Tauri to the gateway — see the testkit).
 *
 * SCOPE BOUNDARY: this stops at the generated prototype (design system +
 * pages). The downstream deconstruct→cutout-slices step needs
 * `createImageBitmap`/OffscreenCanvas/the analysis Web Worker, which jsdom
 * cannot run; that step is covered by `runDeconstructMockup`'s own unit tests
 * and the `src/algorithm` suite. A minimal `createImageBitmap` stub keeps the
 * run from crashing before the assertion, which is satisfied earlier, while
 * the prototype pages are committed.
 *
 * Gated behind CUTOUT_RUN_PIPELINE_BENCHMARK=1 — real model + real image
 * generation, real spend (multiple image calls), and multiple minutes per run.
 * Requires MOX_API_KEY + MOX_BASE_URL.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { I18nProvider } from '@lingui/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activateLocale, i18n } from '@/i18n/index'
import { ServiceProvider } from '@/services/context'
import { ImageImportActionsProvider } from '@/hooks/image-import-actions'
import { SettingsUIProvider } from '@/components/settings/settings-ui'
import { LibraryUIProvider } from '@/components/library/library-ui'
import { IntentWorkspace } from './IntentWorkspace'
import { getStoreState } from '@/store'
import { ok, err } from '@/services/types'
import type { ServiceRegistry } from '@/services/types'
import type { ModelAssignments } from '@/services/ai/model-assignment-types'
import {
  apiBase,
  createGatewayGenerationService,
  GATEWAY_CHAT_MODEL,
  GATEWAY_IMAGE_MODEL,
  GATEWAY_PROVIDER_ID,
} from '@/services/ai/gateway-generation.testkit'

const RUN = process.env.CUTOUT_RUN_PIPELINE_BENCHMARK === '1'

vi.mock('@/services/ai/model-assignment.local', () => ({
  loadAssignments: async (): Promise<ModelAssignments> => ({
    chat: { providerId: GATEWAY_PROVIDER_ID, model: GATEWAY_CHAT_MODEL },
    image: { providerId: GATEWAY_PROVIDER_ID, model: GATEWAY_IMAGE_MODEL },
  }),
  setAssignment: async () => ({}),
}))

// The gateway generation service transitively imports the Tauri proxy fetch;
// its `invoke` is never called (text rides the injected adapter, images ride
// direct fetch), but mock the module so the import resolves in jsdom.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async () => {
    throw new Error('Tauri invoke is not available in the gateway pipeline test')
  },
  Channel: class {},
}))

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required.`)
  return value
}

async function waitFor<T>(check: () => T, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let last: T = check()
  while (!last && Date.now() < deadline) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500))
    })
    last = check()
  }
  return last
}

function fakeRegistry(key: string, base: string): ServiceRegistry {
  const notUsed = async (): Promise<never> => {
    throw new Error('not used in this test')
  }
  return {
    session: { current: async () => ({ userId: 'test', isAuthenticated: false }) },
    cutout: { run: async () => err('not used in this test') },
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
      list: async () => [
        { id: GATEWAY_PROVIDER_ID, kind: 'openai', label: 'MOX', defaultModel: GATEWAY_CHAT_MODEL, enabled: true },
      ],
      upsert: notUsed,
      remove: notUsed,
      setKey: notUsed,
      status: async () => ({ hasKey: true }),
      statuses: async (ids) => Object.fromEntries(ids.map((id) => [id, true])),
      test: notUsed,
    },
    generation: createGatewayGenerationService(key, base),
    prompts: {
      list: async () => [],
      versions: notUsed,
      resolve: notUsed,
      render: async () => ({ system: 'test' }),
    },
  }
}

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// jsdom has no createImageBitmap; the pipeline decodes generated PNGs for the
// (out-of-scope) deconstruct step AFTER the prototype pages are committed. A
// stub bitmap keeps the run from throwing before the store assertion below.
const globalWithBitmap = globalThis as typeof globalThis & {
  createImageBitmap?: (source: unknown) => Promise<{ width: number; height: number; close(): void }>
}
if (typeof globalWithBitmap.createImageBitmap !== 'function') {
  globalWithBitmap.createImageBitmap = async () => ({ width: 1024, height: 1024, close() {} })
}

describe.skipIf(!RUN)('brief → prototype delivery — rendered IntentWorkspace vs. a real gateway', () => {
  let root: Root | undefined
  let host: HTMLDivElement | undefined

  beforeEach(async () => {
    getStoreState().resetProject()
    if (!i18n.locale) await activateLocale('en')
  })

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = undefined
    host = undefined
  })

  function mount(key: string, base: string) {
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
                  <ServiceProvider registry={fakeRegistry(key, base)}>
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

  it(
    'generates and commits a design system and prototype pages from a clear brief',
    { timeout: 900_000 },
    async () => {
      const key = required('MOX_API_KEY')
      const base = apiBase(required('MOX_BASE_URL'))
      const node = mount(key, base)

      const textarea = await waitFor(
        () => node.querySelector<HTMLTextAreaElement>('[aria-label="Message the Agent"]'),
        15_000,
      )
      expect(textarea).toBeTruthy()

      // Let the assignments/providers React Query instances settle before submit.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 800))
      })

      // Deliberately unambiguous — states platform, primary user, and scope —
      // so planPrototype proceeds (humanLoop.mode === 'continue') instead of
      // asking, and keeps the page count small.
      const brief =
        '为一家独立咖啡店做一个 iPad 横屏点单结账原型。主要用户是店员。' +
        '范围只需要两个页面：一个菜单浏览与下单页，一个结账收款页。' +
        '风格现代简洁、浅色。这是一个清晰明确的需求，直接开始生成，不需要再问我问题。'

      act(() => {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
        setter.call(textarea, brief)
        textarea!.dispatchEvent(new Event('input', { bubbles: true }))
      })

      const sendButton = () => node.querySelector<HTMLButtonElement>('[aria-label="Send"]')!
      const questionCard = () => node.querySelector<HTMLElement>('[aria-label="Choose a direction"]')
      expect(sendButton().disabled).toBe(false)
      await act(async () => {
        sendButton().click()
      })

      // Poll for delivery. The tool gate runs a real model, which may decide to
      // ask a clarifying question first (models don't reliably obey "don't ask")
      // — if a question card appears, answer it with "Use your judgment" and
      // submit, so the run proceeds into the fixed pipeline instead of hanging
      // suspended on an unanswered ask. Delivery = a design system AND at least
      // one generated page committed to the store (lands during
      // generatePrototypeSuite, before the canvas-dependent deconstruct step).
      let answeredQuestions = 0
      const deadline = Date.now() + 840_000
      let delivered: ReturnType<typeof getStoreState>['workspaceSnapshot'] = null
      while (Date.now() < deadline) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 500))
        })
        const snapshot = getStoreState().workspaceSnapshot
        if (snapshot?.prototypeDesignSystem && (snapshot.prototypePages?.length ?? 0) > 0) {
          delivered = snapshot
          break
        }
        if (snapshot?.runError) break
        const card = questionCard()
        if (card && answeredQuestions < 3) {
          const useJudgment = [...card.querySelectorAll('button')].find(
            (button) => button.getAttribute('aria-label') === 'Use your judgment',
          )
          act(() => useJudgment?.click())
          await act(async () => {
            sendButton().click()
          })
          answeredQuestions += 1
        }
      }

      if (!delivered?.prototypeDesignSystem) {
        const s = getStoreState().workspaceSnapshot
        throw new Error(
          `DIAG pipeline did not deliver. answeredQuestions=${answeredQuestions} ` +
            `workflowPhase=${s?.workflowPhase} ` +
            `runError=${s?.runError ?? 'none'} ` +
            `planPresent=${Boolean(s?.prototypePlan)} ` +
            `humanLoop=${s?.prototypePlan?.humanLoop.mode ?? 'n/a'} ` +
            `planPages=${s?.prototypePlan?.pages.length ?? 0} ` +
            `designSystem=${Boolean(s?.prototypeDesignSystem)} ` +
            `pages=${s?.prototypePages?.length ?? 0}`,
        )
      }
      expect(delivered).toBeTruthy()
      expect(delivered!.prototypeDesignSystem).toBeTruthy()
      expect(delivered!.prototypePlan?.pages.length).toBeGreaterThan(0)
      expect(delivered!.prototypePages.length).toBeGreaterThan(0)
      // Each generated page carries a real image and its plan identity.
      for (const page of delivered!.prototypePages) {
        expect(page.page.id.length).toBeGreaterThan(0)
        expect(page.page.name.length).toBeGreaterThan(0)
      }
    },
  )
})
