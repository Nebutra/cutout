// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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
import { ok, type Result } from '@/services/types'
import type { ServiceRegistry } from '@/services/types'
import type { GenerateWithToolsOutput } from '@/services/ai/types'
import type { ModelAssignments } from '@/services/ai/model-assignment-types'
import { createRunEvent, replayRunEvents } from '@/agent-runtime/run-events'
import { createEmptyWorkspaceSnapshot } from '@/workspace/workspace-snapshot'
import { installE2eLocalStorage } from './intent-workspace.e2e.testkit'

const PROVIDER_ID = 'regeneration-provider'
const MODEL = 'regeneration-model'
const storage = installE2eLocalStorage()

vi.mock('@/services/ai/model-assignment.local', () => ({
  loadAssignments: async (): Promise<ModelAssignments> => ({
    chat: { providerId: PROVIDER_ID, model: MODEL },
    image: { providerId: PROVIDER_ID, model: MODEL },
  }),
  setAssignment: async () => ({}),
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

;(globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => { resolve = next })
  return { promise, resolve }
}

async function waitFor<T>(check: () => T, timeoutMs = 5_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let value = check()
  while (!value && Date.now() < deadline) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
    value = check()
  }
  return value
}

function fakeRegistry(
  toolGateStarted: () => void,
  toolGateResult: Promise<Result<GenerateWithToolsOutput>>,
): ServiceRegistry {
  const notUsed = async (): Promise<never> => { throw new Error('not used in this test') }
  return {
    session: { current: async () => ({ userId: 'test', isAuthenticated: false }) },
    cutout: { run: async () => notUsed() },
    foregroundSegmentation: {
      capabilities: async () => ok({ available: false, platform: 'test', backend: 'unavailable', reason: 'capability-required' }),
      segment: async () => ({ ok: false, error: 'capability-required' }),
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
      list: async () => [{ id: PROVIDER_ID, kind: 'openai', label: 'Test', defaultModel: MODEL, enabled: true }],
      upsert: notUsed,
      remove: notUsed,
      setKey: notUsed,
      status: async () => ({ hasKey: true }),
      statuses: async (ids) => Object.fromEntries(ids.map((id) => [id, true])),
      test: async () => ok({ model: MODEL }),
    },
    generation: {
      generateText: notUsed,
      streamText: async function* () { yield 'Fresh response' },
      generateImages: notUsed,
      editImage: notUsed,
      research: notUsed,
      generateObject: notUsed,
      generateWithTools: async () => {
        toolGateStarted()
        return toolGateResult
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

describe('Agent response regeneration workspace flow', () => {
  let root: Root | undefined
  let host: HTMLDivElement | undefined

  beforeEach(async () => {
    getStoreState().resetProject()
    storage.clear()
    if (!i18n.locale) await activateLocale('en')
  })

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = undefined
    host = undefined
  })

  it('clears stale errors and appends a selected sibling without another user turn', async () => {
    const gateStarted = deferred<void>()
    const gateResult = deferred<Result<GenerateWithToolsOutput>>()
    const events = replayRunEvents([
      createRunEvent('run:old', { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent('run:old', { type: 'intent-recorded', intent: 'Who are you?' }, { eventId: 'user', at: 2 }),
      createRunEvent('run:old', { type: 'agent-message', message: 'Old response' }, { eventId: 'agent', at: 3 }),
      createRunEvent('run:old', { type: 'run-cancelled', reason: 'Previous attempt stopped.' }, { eventId: 'cancel', at: 4 }),
    ])
    getStoreState().setBrief('Who are you?')
    getStoreState().failGen('generate', 'Stale generation error')
    getStoreState().setWorkspaceSnapshot(createEmptyWorkspaceSnapshot({
      runError: 'Stale stopped error',
      agentRunEvents: events,
    }))

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
                  <ServiceProvider registry={fakeRegistry(() => gateStarted.resolve(), gateResult.promise)}>
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

    const regenerate = await waitFor(() => host!.querySelector<HTMLButtonElement>('[aria-label="Regenerate response"]'))
    expect(regenerate).toBeTruthy()
    expect(host.textContent).toContain('Stale stopped error')
    // The durable transcript renders before the independent assignment query
    // settles; wait for the same route-preflight boundary production requires.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 500)) })

    await act(async () => {
      regenerate!.click()
      await gateStarted.promise
    })

    expect(host.textContent).not.toContain('Stale stopped error')
    expect(getStoreState().genError).toBeNull()
    expect(await waitFor(() => host!.querySelectorAll('[data-slot="agent-activity-bubble"]').length === 1)).toBe(true)
    expect(host.querySelectorAll('[data-slot="user-message"]')).toHaveLength(1)
    expect(host.querySelectorAll('[data-slot="agent-message"]')).toHaveLength(2)

    await act(async () => {
      gateResult.resolve(ok({
        text: '',
        toolCalls: [{
          toolCallId: 'reply-call',
          toolName: 'reply_conversationally',
          input: { reply: 'Grounded response' },
          output: { reply: 'Grounded response' },
        }],
      }))
      await Promise.resolve()
    })

    expect(await waitFor(() => host!.textContent?.includes('Fresh response'))).toBe(true)
    expect(await waitFor(() => host!.querySelectorAll('[data-slot="agent-activity-bubble"]').length === 0)).toBe(true)
    expect(host.querySelectorAll('[data-slot="user-message"]')).toHaveLength(1)
    expect(host.querySelectorAll('[data-slot="agent-message"]')).toHaveLength(1)
    expect(host.textContent).not.toContain('Old response')
    expect(host.querySelector('[aria-label="Response 2 of 2"]')?.textContent).toContain('2 / 2')
    expect(getStoreState().workspaceSnapshot?.runError).toBeNull()
    const persistedEvents = getStoreState().workspaceSnapshot?.agentRunEvents?.events ?? []
    expect(persistedEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'agent-message', message: 'Fresh response', responseToEventId: 'user' }),
      expect.objectContaining({ type: 'branch-selected', sourceEventId: 'user' }),
      expect.objectContaining({ type: 'step-started', label: 'Preparing the run', detail: 'Checking your request…' }),
      expect.objectContaining({ type: 'step-succeeded', label: 'Preparing the run', detail: 'Request checked.' }),
    ]))
    expect(persistedEvents.some((event) => event.type === 'message-revised' && event.targetEventId === 'agent')).toBe(false)

    await act(async () => host!.querySelector<HTMLButtonElement>('[aria-label="Previous response"]')!.click())
    expect(await waitFor(() => host!.textContent?.includes('Old response'))).toBe(true)
    expect(host.querySelector('[aria-label="Response 1 of 2"]')?.textContent).toContain('1 / 2')
    expect(host.querySelectorAll('[data-slot="agent-activity-bubble"]')).toHaveLength(0)
    expect(host.querySelectorAll('[data-slot="agent-message"]')).toHaveLength(1)

    await act(async () => host!.querySelector<HTMLButtonElement>('[aria-label="Next response"]')!.click())
    expect(await waitFor(() => host!.textContent?.includes('Fresh response'))).toBe(true)
    expect(host.querySelector('[aria-label="Response 2 of 2"]')?.textContent).toContain('2 / 2')
    expect(host.querySelectorAll('[data-slot="agent-activity-bubble"]')).toHaveLength(0)
    expect(host.querySelectorAll('[data-slot="agent-message"]')).toHaveLength(1)
  }, 15_000)

  it('treats a direct no-tool answer as a message regeneration instead of entering the asset pipeline', async () => {
    const gateStarted = deferred<void>()
    const gateResult = deferred<Result<GenerateWithToolsOutput>>()
    const events = replayRunEvents([
      createRunEvent('run:old', { type: 'run-started', mode: 'create' }, { eventId: 'start', at: 1 }),
      createRunEvent('run:old', { type: 'intent-recorded', intent: 'Who are you?' }, { eventId: 'user', at: 2 }),
      createRunEvent('run:old', { type: 'agent-message', message: 'Old response' }, { eventId: 'agent', at: 3 }),
    ])
    getStoreState().setBrief('Who are you?')
    getStoreState().setWorkspaceSnapshot(createEmptyWorkspaceSnapshot({ agentRunEvents: events }))

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
                  <ServiceProvider registry={fakeRegistry(() => gateStarted.resolve(), gateResult.promise)}>
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

    const regenerate = await waitFor(() => host!.querySelector<HTMLButtonElement>('[aria-label="Regenerate response"]'))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 500)) })
    await act(async () => {
      regenerate!.click()
      await gateStarted.promise
    })

    expect(await waitFor(() => host!.querySelectorAll('[data-slot="agent-activity-bubble"]').length === 1)).toBe(true)
    expect(host.querySelectorAll('[data-slot="user-message"]')).toHaveLength(1)
    expect(host.querySelectorAll('[data-slot="agent-message"]')).toHaveLength(2)

    await act(async () => {
      gateResult.resolve(ok({ text: 'Direct answer', toolCalls: [] }))
      await Promise.resolve()
    })

    expect(await waitFor(() => host!.textContent?.includes('Fresh response'))).toBe(true)
    expect(await waitFor(() => host!.querySelectorAll('[data-slot="agent-activity-bubble"]').length === 0)).toBe(true)
    expect(host.querySelectorAll('[data-slot="user-message"]')).toHaveLength(1)
    expect(host.querySelectorAll('[data-slot="agent-message"]')).toHaveLength(1)
    expect(host.textContent).not.toContain('Old response')
    const persistedEvents = getStoreState().workspaceSnapshot?.agentRunEvents?.events ?? []
    expect(persistedEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'agent-message', message: 'Fresh response', responseToEventId: 'user' }),
      expect.objectContaining({ type: 'branch-selected', sourceEventId: 'user' }),
    ]))
    expect(persistedEvents.some((event) => event.type === 'message-revised' && event.targetEventId === 'agent')).toBe(false)
  }, 15_000)
})
