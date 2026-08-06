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
const { tauriInvokeMock } = vi.hoisted(() => ({ tauriInvokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauriInvokeMock,
  Channel: class {
    onmessage = (_payload: unknown) => {}
  },
}))

vi.mock('@/services/ai/model-assignment.local', () => ({
  loadCapabilityBindings: async () => ({
    version: 'model-assignments.v2' as const,
    bindings: {
      text: { providerId: PROVIDER_ID, model: MODEL },
      vision: { providerId: PROVIDER_ID, model: MODEL },
      'image-generation': { providerId: PROVIDER_ID, model: MODEL },
      'image-edit': { providerId: PROVIDER_ID, model: MODEL },
    },
    descriptors: [],
  }),
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
      test: async () => ok({ model: MODEL, models: [MODEL] }),
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
    tauriInvokeMock.mockReset()
    tauriInvokeMock.mockImplementation((command: string) => {
      if (command === 'codex_system_probe') {
        return Promise.resolve({
          runtimeId: 'codex-system',
          installed: false,
          authenticated: false,
          authClass: 'unknown',
          capability: 'unsupported',
          execution: 'unproven',
          reason: 'not-installed',
        })
      }
      return Promise.reject(new Error(`Unexpected native command: ${command}`))
    })
    if (!i18n.locale) await activateLocale('en')
  })

  it('uses a ready system Codex turn before direct text Provider preflight', async () => {
    const directToolGate = vi.fn()
    const providerTest = vi.fn(async () => ok({ model: MODEL, models: [MODEL] }))
    const registry = fakeRegistry(
      directToolGate,
      Promise.resolve(ok({ text: '', toolCalls: [] })),
    )
    registry.providers.test = providerTest
    tauriInvokeMock.mockImplementation((command: string, args?: {
      input?: { requestId?: string; contextRevision?: string }
    }) => {
      if (command === 'codex_system_probe') {
        return Promise.resolve({
          runtimeId: 'codex-system',
          installed: true,
          authenticated: true,
          authClass: 'chatgpt',
          capability: 'proven',
          execution: 'unproven',
          version: '0.146.0',
        })
      }
      if (command === 'codex_system_turn_start') {
        return Promise.resolve({
          output: {
            action: 'reply',
            reply: 'I can help shape that idea.',
            generation: null,
            clarification: null,
            material: null,
            regeneration: null,
            targetPageNames: null,
          },
          receipt: {
            protocol: 'cutout.codex-execution.v1',
            runtimeId: 'codex-system',
            runtimeVersion: '0.146.0',
            bindingId: 'codex:binding',
            requestId: args?.input?.requestId,
            turnId: 'turn.1',
            contextRevision: args?.input?.contextRevision,
            contextDigest: 'a'.repeat(64),
            outputDigest: 'b'.repeat(64),
            completedAt: 1,
          },
        })
      }
      return Promise.reject(new Error(`Unexpected native command: ${command}`))
    })
    getStoreState().setBrief('Hello, can you help me think through an idea?')
    getStoreState().setWorkspaceSnapshot(createEmptyWorkspaceSnapshot())
    getStoreState().requestAgentRun('create-assets')

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
                  <ServiceProvider registry={registry}>
                    <ImageImportActionsProvider value={{ openPicker: () => {} }}>
                      <IntentWorkspace projectId="project.1" />
                    </ImageImportActionsProvider>
                  </ServiceProvider>
                </LibraryUIProvider>
              </SettingsUIProvider>
            </TooltipProvider>
          </I18nProvider>
        </QueryClientProvider>,
      )
    })

    expect(await waitFor(() => host!.textContent?.includes('I can help shape that idea.'))).toBe(true)
    expect(directToolGate).not.toHaveBeenCalled()
    expect(providerTest).not.toHaveBeenCalled()
    expect(tauriInvokeMock).toHaveBeenCalledWith(
      'codex_system_turn_start',
      expect.objectContaining({
        input: expect.objectContaining({
          workspaceHandle: 'workspace:project.1',
          conversationId: 'conversation:primary',
        }),
      }),
    )
    const preparationEvents = await waitFor(() => {
      const events = getStoreState().workspaceSnapshot?.agentRunEvents?.events.filter((event) =>
        (event.type === 'step-started'
          || event.type === 'step-succeeded'
          || event.type === 'step-failed'
          || event.type === 'step-cancelled')
        && event.stepId.startsWith('step:prepare:'),
      ) ?? []
      return events.length === 8 ? events : undefined
    })
    expect(preparationEvents?.map((event) => [event.type, 'label' in event ? event.label : null])).toEqual([
      ['step-started', 'Prepare bounded context'],
      ['step-succeeded', 'Prepare bounded context'],
      ['step-started', 'Connect planning runtime'],
      ['step-succeeded', 'Connect planning runtime'],
      ['step-started', 'Await planning result'],
      ['step-succeeded', 'Await planning result'],
      ['step-started', 'Validate structured response'],
      ['step-succeeded', 'Validate structured response'],
    ])
  })

  it('surfaces Retry for a transient Codex failure and retries the same runtime', async () => {
    const directToolGate = vi.fn()
    const providerTest = vi.fn(async () => ok({ model: MODEL, models: [MODEL] }))
    const registry = fakeRegistry(
      directToolGate,
      Promise.resolve(ok({ text: '', toolCalls: [] })),
    )
    registry.providers.test = providerTest
    let probeCount = 0
    let turnCount = 0
    tauriInvokeMock.mockImplementation((command: string, args?: {
      input?: { requestId?: string; contextRevision?: string }
    }) => {
      if (command === 'codex_system_probe') {
        probeCount += 1
        return Promise.resolve({
          runtimeId: 'codex-system',
          installed: true,
          authenticated: true,
          authClass: 'chatgpt',
          capability: 'proven',
          execution: probeCount === 1 ? 'unproven' : 'failed',
          ...(probeCount === 1 ? {} : { lastFailure: 'runtime-failed' }),
          version: '0.146.0',
        })
      }
      if (command === 'codex_system_turn_start') {
        turnCount += 1
        if (turnCount === 1) {
          return Promise.reject(new Error('planning runtime transport failed'))
        }
        return Promise.resolve({
          output: {
            action: 'reply',
            reply: 'The planning Agent recovered.',
            generation: null,
            clarification: null,
            material: null,
            regeneration: null,
            targetPageNames: null,
          },
          receipt: {
            protocol: 'cutout.codex-execution.v1',
            runtimeId: 'codex-system',
            runtimeVersion: '0.146.0',
            bindingId: 'codex:binding',
            requestId: args?.input?.requestId,
            turnId: 'turn.2',
            contextRevision: args?.input?.contextRevision,
            contextDigest: 'a'.repeat(64),
            outputDigest: 'b'.repeat(64),
            completedAt: 2,
          },
        })
      }
      return Promise.reject(new Error(`Unexpected native command: ${command}`))
    })
    getStoreState().setBrief('Help me think through a restaurant website.')
    getStoreState().setWorkspaceSnapshot(createEmptyWorkspaceSnapshot())
    getStoreState().requestAgentRun('create-assets')

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
                  <ServiceProvider registry={registry}>
                    <ImageImportActionsProvider value={{ openPicker: () => {} }}>
                      <IntentWorkspace projectId="project.1" />
                    </ImageImportActionsProvider>
                  </ServiceProvider>
                </LibraryUIProvider>
              </SettingsUIProvider>
            </TooltipProvider>
          </I18nProvider>
        </QueryClientProvider>,
      )
    })

    const retry = await waitFor(() =>
      host!.querySelector<HTMLButtonElement>('[data-agent-action="retry-run"]'))
    expect(retry).toBeTruthy()
    expect(host.textContent).toContain('The planning Agent could not finish this turn.')
    const failedPreparation = getStoreState().workspaceSnapshot?.agentRunEvents?.events
      .filter((event) => event.type === 'step-failed' && event.stepId.startsWith('step:prepare:'))
      .at(-1)
    expect(failedPreparation).toEqual(expect.objectContaining({
      type: 'step-failed',
      label: 'Connect planning runtime',
    }))

    await act(async () => retry!.click())

    expect(await waitFor(() => host!.textContent?.includes('The planning Agent recovered.'))).toBe(true)
    expect(turnCount).toBe(2)
    expect(probeCount).toBeGreaterThanOrEqual(2)
    expect(directToolGate).not.toHaveBeenCalled()
    expect(providerTest).not.toHaveBeenCalled()
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
      createRunEvent('run:old', { type: 'agent-message', message: 'Old response', responseToEventId: 'user' }, { eventId: 'agent', at: 3 }),
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
      createRunEvent('run:old', { type: 'agent-message', message: 'Old response', responseToEventId: 'user' }, { eventId: 'agent', at: 3 }),
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
