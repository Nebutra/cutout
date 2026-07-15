/**
 * Real end-to-end verification of the human-loop ask/await feature — renders
 * the ACTUAL `IntentWorkspace` React component (react-dom/client + act, the
 * same no-testing-library pattern already used by
 * `src/components/settings/sections/PersonalizationSection.test.tsx`),
 * drives it with real user-facing DOM events (type, click), and lets the
 * tool-gate model call hit a REAL gateway (same gpt-5.5 endpoint already
 * proven in `tool-gate-classification.integration.test.ts`). This is the one
 * thing neither the unit tests nor the logic-level integration test can
 * cover: does the actual rendered composer/HumanLoopQuestion UI behave
 * correctly, especially the agentBusy/disabled fix (a real bug this exact
 * feature's implementation introduced and this test would have caught).
 *
 * Every service EXCEPT `generation.generateWithTools` is a lightweight
 * stub — this is deliberately NOT a test of asset generation, provider
 * settings, or the downstream planning pipeline; those are covered
 * elsewhere. `@/services/ai/model-assignment.local` is mocked because
 * `useModelAssignments()` calls it directly (bypassing the injected
 * ServiceRegistry) to read a Tauri-plugin-store-backed local preference —
 * unavailable in jsdom, so real component wiring is used everywhere except
 * this one Tauri-only leaf.
 *
 * Skipped unless CUTOUT_RUN_TOOL_GATE_BENCHMARK=1 is set — matches the
 * convention already established for real-model tests in this repo.
 *
 * History worth keeping: early runs of this test could not get the model to
 * naturally call `ask_clarifying_question` from inside this exact rendered
 * harness (multiple real-model attempts across several brief variants
 * failed), while the narrower, hand-built `tool-gate-classification.
 * integration.test.ts` succeeded immediately. The actual cause was NOT model
 * non-determinism — it was a real bug this test eventually caught: `tryToolGate()`
 * never called `startAgentRun` for its own runId before invoking the model,
 * so the bridge's live `human-loop-asked` event was silently dropped by
 * `appendRunEvent`'s activeRunId gate every single time, indistinguishable
 * from "the model didn't ask" from outside. Once that ordering bug was
 * fixed (see clarification-bridge.ts / tryToolGate's `startAgentRun`
 * placement), this test started passing immediately and consistently. Two
 * more real environment gaps surfaced once the event actually landed:
 * `Element.prototype.scrollIntoView` (the run-feed auto-scrolls when it
 * grows) and a genuine UX bug — choosing a direction alone (no typed text)
 * left the composer's Send button permanently disabled, because `canSubmit`
 * required non-empty text; fixed via `AgentComposerModel.allowEmptySubmit`.
 * All fixes landed in application code, not in this test. The harness also
 * caught two earlier environment-only gaps during development: missing i18n
 * activation and a missing `ImageImportActionsProvider`.
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
import { err, ok, type Result } from '@/services/types'
import type { ServiceRegistry } from '@/services/types'
import type { GenerateWithToolsInput, GenerateWithToolsOutput } from '@/services/ai/types'
import type { ModelAssignments } from '@/services/ai/model-assignment-types'

const RUN = process.env.CUTOUT_RUN_TOOL_GATE_BENCHMARK === '1'
const MODEL = 'gpt-5.5'
const PROVIDER_ID = 'test-provider'

vi.mock('@/services/ai/model-assignment.local', () => ({
  loadAssignments: async (): Promise<ModelAssignments> => ({
    chat: { providerId: PROVIDER_ID, model: MODEL },
    image: { providerId: PROVIDER_ID, model: MODEL },
  }),
  setAssignment: async () => ({}),
}))

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function apiBase(value: string): string {
  const parsed = new URL(value)
  if (!parsed.pathname || parsed.pathname === '/') parsed.pathname = '/v1'
  return parsed.toString().replace(/\/$/, '')
}

/** Polls `check` (a DOM query, typically) until it returns a truthy value or `timeoutMs` elapses. */
async function waitFor<T>(check: () => T, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let last: T = check()
  while (!last && Date.now() < deadline) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200))
    })
    last = check()
  }
  return last
}

/**
 * Same real-gateway call already proven in tool-gate-classification.integration.test.ts.
 * Deliberately does NOT force `toolChoice` to `ask_clarifying_question`: forcing it was
 * tried and caused the call to hang indefinitely against this gateway (a compatibility
 * quirk with forced tool_choice, not a bug in this app's code) — free classification, the
 * same mode production actually uses, responds in a few seconds. Real-model classification
 * is a probabilistic judgment call, not a deterministic one; see the retry loop in the test
 * body below for how this is handled instead of forcing.
 */
function realGenerateWithTools(key: string, base: string) {
  return async (input: GenerateWithToolsInput): Promise<Result<GenerateWithToolsOutput>> => {
    const { generateText: aiGenerateText, stepCountIs, tool: aiTool } = await import('ai')
    const { createOpenAI } = await import('@ai-sdk/openai')
    const provider = createOpenAI({ apiKey: key, baseURL: base })
    const tools = Object.fromEntries(
      input.tools.map((generationTool) => [
        generationTool.name,
        aiTool({
          description: generationTool.description,
          inputSchema: generationTool.inputSchema,
          execute: (toolInput: unknown) => generationTool.execute(toolInput),
        }),
      ]),
    )
    try {
      const result = await aiGenerateText({
        model: provider(input.model ?? MODEL),
        prompt: input.prompt,
        tools,
        stopWhen: stepCountIs(input.maxSteps),
        abortSignal: input.signal,
      })
      const toolCalls: GenerateWithToolsOutput['toolCalls'] extends readonly (infer T)[] ? T[] : never = []
      for (const step of result.steps) {
        for (const part of step.content) {
          if (part.type === 'tool-result') {
            toolCalls.push({ toolCallId: part.toolCallId, toolName: part.toolName, input: part.input, output: part.output })
          } else if (part.type === 'tool-error') {
            toolCalls.push({
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: part.input,
              output: undefined,
              error: part.error instanceof Error ? part.error.message : String(part.error),
            })
          }
        }
      }
      return ok({ text: result.text, toolCalls })
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error))
    }
  }
}

function fakeRegistry(key: string, base: string): ServiceRegistry {
  const notUsed = async (): Promise<never> => { throw new Error('not used in this test') }
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
      list: async () => [{
        id: PROVIDER_ID, kind: 'openai', label: 'Test', defaultModel: MODEL, enabled: true,
      }],
      upsert: notUsed,
      remove: notUsed,
      setKey: notUsed,
      status: async () => ({ hasKey: true }),
      statuses: async (ids) => Object.fromEntries(ids.map((id) => [id, true])),
      test: notUsed,
    },
    generation: {
      generateText: async () => err('not used in this test'),
      streamText: async function* () {
        throw new Error('not used in this test')
        // eslint-disable-next-line no-unreachable -- keeps `streamText` structurally an async generator, never runs
        yield ''
      },
      generateImages: async () => err('not used in this test'),
      editImage: async () => err('not used in this test'),
      research: async () => err('not used in this test'),
      // Bounds the test: once the tool-gate resolves, whatever falls through
      // to the fixed pipeline fails fast here instead of running a real,
      // expensive plan→design-system→pages generation — irrelevant to what
      // this test verifies (the ask/answer UI wiring itself).
      generateObject: async () => err('not used in this test'),
      generateWithTools: realGenerateWithTools(key, base),
    },
    prompts: {
      list: async () => [],
      versions: notUsed,
      resolve: notUsed,
      render: async () => ({ system: 'test' }),
    },
  }
}

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom doesn't implement ResizeObserver; @xyflow/react (the canvas behind
// IntentWorkspace) uses it in a mount effect.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub

// jsdom doesn't implement scrollIntoView; the run-events feed
// (AgentWorkspaceDock.tsx) auto-scrolls to the newest item whenever the
// feed grows — which is exactly the moment a human-loop-asked event lands.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

describe.skipIf(!RUN)('human-loop ask/await — rendered IntentWorkspace vs. a real model', () => {
  let root: Root | undefined
  let host: HTMLDivElement | undefined

  beforeEach(async () => {
    getStoreState().resetProject()
    // `I18nProvider` renders nothing until the shared `i18n` singleton has an
    // active locale — normally activated in main.tsx before first paint,
    // which this test harness bypasses entirely.
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
    'a real clarifying question renders correctly, keeps the composer enabled, and resolves on answer',
    { timeout: 120_000 },
    async () => {
      const key = required('MOX_API_KEY')
      const base = apiBase(required('MOX_BASE_URL'))

      // Real-model classification is a probabilistic judgment call, not a
      // deterministic one (already proven working, unforced, in
      // tool-gate-classification.integration.test.ts) — try a couple of
      // increasingly explicit-about-their-own-ambiguity briefs, remounting
      // fresh each time, rather than pinning this test to one exact
      // response from one exact call.
      const briefs = [
        '做一个 App',
        '帮我做一个记账工具，你觉得应该做网页版还是手机 App？我还没想好，也不确定主要给谁用。',
        '帮我设计一个内部工具的原型，目标用户可能是不熟悉技术的运营团队，也可能是工程师——这两类用户需要的界面复杂度和信息密度完全不同，选错了方向这次原型就白做了。',
      ]

      let node!: HTMLDivElement
      let textarea!: HTMLTextAreaElement
      let questionSection: HTMLElement | null = null

      for (const brief of briefs) {
        // A prior attempt that fell through to the (stubbed-to-fail) fixed
        // pipeline can still have mutated store state before failing — a
        // non-null prototypeDesignSystem/prototypePages would offer
        // configureRegenerationTool on the next attempt, changing the tool
        // list and the whole prompt shape. Reset before every attempt, not
        // just once via beforeEach.
        getStoreState().resetProject()
        node = mount(key, base)

        // The very first synchronous render pass has assignments/providers
        // queries still pending (React Query resolves even instant mocks
        // via a microtask) — the composer may not exist in the DOM yet.
        const found = await waitFor(
          () => node.querySelector<HTMLTextAreaElement>('[aria-label="Message the Agent"]'),
          10_000,
        )
        expect(found).toBeTruthy()
        textarea = found!

        // The textarea appearing only means the `providers` query resolved
        // — `assignments` is a separate React Query instance that can
        // still be mid-flight, and createAssets() reads `assignments.data
        // ?? {}` synchronously on submit. Give it a beat to settle too.
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 500))
        })

        act(() => {
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
          setter.call(textarea, brief)
          textarea.dispatchEvent(new Event('input', { bubbles: true }))
        })

        const sendButton = () => node.querySelector<HTMLButtonElement>('[aria-label="Send"]')!
        expect(sendButton().disabled).toBe(false)
        await act(async () => {
          sendButton().click()
        })

        // The real model call is in flight (suspended inside the tool-gate's
        // ask_clarifying_question call) — poll until the question card renders.
        questionSection = await waitFor(
          () => node.querySelector<HTMLElement>('[aria-label="Choose a direction"]'),
          25_000,
        )
        if (questionSection) break
        act(() => root?.unmount())
        node.remove()
        root = undefined
      }
      expect(questionSection).toBeTruthy()

      // This is the exact bug this feature's implementation introduced and
      // fixed: agentBusy is set true before the suspended tool-gate call
      // even starts, so without the fix the composer would stay disabled
      // for the ENTIRE suspension and the user could never answer.
      expect(textarea.disabled).toBe(false)
      const sendButton = () => node.querySelector<HTMLButtonElement>('[aria-label="Send"]')!
      expect(sendButton().disabled).toBe(false)

      const useJudgmentButton = [...questionSection!.querySelectorAll('button')]
        .find((button) => button.getAttribute('aria-label') === 'Use your judgment')!
      expect(useJudgmentButton).toBeTruthy()
      act(() => useJudgmentButton.click())

      await act(async () => {
        sendButton().click()
      })

      // The model resumes and finishes (or the deliberately-stubbed-out
      // downstream pipeline fails fast) — either way the live ask resolves
      // and the question card is no longer showing a PENDING state for the
      // same askId. Poll for the question section to disappear (waitFor
      // polls for truthy, so invert the check).
      await waitFor(() => !node.querySelector('[aria-label="Choose a direction"]'), 15_000)
      expect(node.querySelector('[aria-label="Choose a direction"]')).toBeFalsy()
    },
  )
})
