/**
 * Real-model verification of `tryToolGate`'s classification prompts — the
 * one thing unit tests with a fake `generateWithTools` can never cover: does
 * an actual model call the right tool (or no tool at all) for the exact
 * prompt shapes IntentWorkspace.tsx's `tryToolGate` builds? Mirrors the
 * gated-integration-test pattern already established in
 * `src/visual-generation/brand-benchmark.integration.test.ts`
 * (`describe.skipIf`, `required()`, `apiBase()`) rather than inventing a new
 * one. Skipped unless CUTOUT_RUN_TOOL_GATE_BENCHMARK=1 is set (having
 * MOX_API_KEY alone does not opt in — matches the existing convention).
 */
import { generateText as aiGenerateText, stepCountIs, tool as aiTool } from 'ai'
import { describe, expect, it } from 'vitest'
import { runToolLoop } from './tool-loop'
import { astryxThemeTool, askClarifyingQuestionTool, configurePageTargetingTool, configureRegenerationTool, conversationalReplyTool, proceedWithGenerationTool } from './tool-registry'
import { createClarificationBridge } from './clarification-bridge'
import type { AgentRunEvent } from './run-events'
import { parseEditableDesignMarkdown } from '@/prototype/design-md'
import { ok, err, type Result } from '@/services/types'
import type { GenerateWithToolsCall, GenerateWithToolsInput, GenerateWithToolsOutput, GenerationService } from '@/services/ai/types'

const RUN = process.env.CUTOUT_RUN_TOOL_GATE_BENCHMARK === '1'
const MODEL = 'gpt-5.5'

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

/** The real `generateWithTools` shape, talking to the gateway directly instead of through Tauri/resolveConfig. */
function gatewayGeneration(key: string, base: string): Pick<GenerationService, 'generateWithTools'> {
  return {
    async generateWithTools(input: GenerateWithToolsInput): Promise<Result<GenerateWithToolsOutput>> {
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
        const toolCalls: GenerateWithToolsCall[] = []
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
    },
  }
}

/** Mirrors `tryToolGate`'s prompt-building exactly (IntentWorkspace.tsx, `async function tryToolGate`). */
function toolGatePrompt(
  text: string,
  offered: { astryx: boolean, regeneration: boolean, pageTargeting: boolean, proceed?: boolean, ask: boolean },
): string {
  return [
    'The user is talking to a design-tool Agent. Call at most one of the non-question tools '
    + 'below, and only if the request explicitly matches it. You may also call '
    + '`ask_clarifying_question` first if needed — after it returns an answer, decide whether '
    + 'to then call one of the other tools with that answer in hand, or finish.',
    offered.astryx
      ? '- `compile_astryx_theme`: the user is asking to map DESIGN.md colors to Astryx theme '
        + 'variables and/or generate/compile an Astryx theme.'
      : null,
    offered.regeneration
      ? '- `configure_prototype_regeneration`: the user is asking to redo/regenerate the design '
        + 'system, or to control whether pages generate in parallel or one at a time, for the '
        + 'prototype suite that already exists.'
      : null,
    offered.pageTargeting
      ? '- `select_pages_to_regenerate`: the user is naming one or more specific existing pages '
        + 'to redo, leaving the rest of the prototype suite untouched.'
      : null,
    '- `reply_conversationally`: the message is not a build/design request at all — a greeting, '
    + 'small talk, a question, or too vague to plan a product from.',
    offered.ask
      ? '- `ask_clarifying_question`: the request IS a real build/design request, but a key '
        + 'decision (platform, primary user, a must-have feature) is genuinely ambiguous enough '
        + 'that guessing would likely produce the wrong direction. Do not ask for politeness or a '
        + 'detail you can reasonably decide yourself.'
      : null,
    offered.proceed
      ? '- `proceed_with_generation`: the message is a real design/build request that is clear '
        + 'enough to proceed. Prefer calling this (with a distilled, self-contained brief) over '
        + 'doing nothing — especially when the message is rambling or buried in asides.'
      : null,
    'If none of these fit, call nothing — it falls through to the design pipeline.',
    '',
    `User: ${text}`,
  ].filter((line) => line !== null).join('\n')
}

describe.skipIf(!RUN)('tryToolGate classification vs. a real model', () => {
  const key = RUN ? required('MOX_API_KEY') : ''
  const base = RUN ? apiBase(required('MOX_BASE_URL')) : ''
  const generation = RUN ? gatewayGeneration(key, base) : null

  it('a bare greeting calls reply_conversationally, not the build pipeline', { timeout: 30_000 }, async () => {
    const result = await runToolLoop(generation!, {
      runId: 'benchmark:greeting',
      providerId: 'mox',
      model: MODEL,
      prompt: toolGatePrompt('你好', { astryx: false, regeneration: false, pageTargeting: false, ask: false }),
      tools: [conversationalReplyTool()],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.data.calls.map((call) => call.toolName)).toEqual(['reply_conversationally'])
  })

  it('a real terse build brief calls no tool — falls through to the pipeline', { timeout: 30_000 }, async () => {
    const result = await runToolLoop(generation!, {
      runId: 'benchmark:build-brief',
      providerId: 'mox',
      model: MODEL,
      prompt: toolGatePrompt('帮我设计一个记账 App', { astryx: false, regeneration: false, pageTargeting: false, ask: false }),
      tools: [conversationalReplyTool()],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.data.called).toBe(false)
  })

  it('an explicit Astryx mapping request calls compile_astryx_theme', { timeout: 30_000 }, async () => {
    const model = parseEditableDesignMarkdown('- Primary: #beff50\n- Background: #14140f')
    const result = await runToolLoop(generation!, {
      runId: 'benchmark:astryx',
      providerId: 'mox',
      model: MODEL,
      prompt: toolGatePrompt(
        '把 Primary 映射到 --color-accent，生成一个叫 acme 的 Astryx 主题',
        { astryx: true, regeneration: false, pageTargeting: false, ask: false },
      ),
      tools: [astryxThemeTool(model), conversationalReplyTool()],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.data.calls.map((call) => call.toolName)).toContain('compile_astryx_theme')
  })

  it('an explicit regeneration-strategy request calls configure_prototype_regeneration', { timeout: 30_000 }, async () => {
    const result = await runToolLoop(generation!, {
      runId: 'benchmark:regen',
      providerId: 'mox',
      model: MODEL,
      prompt: toolGatePrompt(
        '重新生成设计系统，但保留现有页面不要动',
        { astryx: false, regeneration: true, pageTargeting: false, ask: false },
      ),
      tools: [configureRegenerationTool(), conversationalReplyTool()],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    const call = result.data.calls.find((c) => c.toolName === 'configure_prototype_regeneration')
    expect(call).toBeDefined()
    expect((call!.toolOutput as { forceRegenerateDesignSystem: boolean }).forceRegenerateDesignSystem).toBe(true)
  })

  it('a page-named regeneration request calls select_pages_to_regenerate with the right page ids', { timeout: 30_000 }, async () => {
    const pages = [
      { id: 'page-login', name: 'Login' },
      { id: 'page-settings', name: 'Settings' },
      { id: 'page-dashboard', name: 'Dashboard' },
    ]
    const result = await runToolLoop(generation!, {
      runId: 'benchmark:page-targeting',
      providerId: 'mox',
      model: MODEL,
      prompt: toolGatePrompt(
        '重新生成 Login 页面就行，别的页面不用动',
        { astryx: false, regeneration: false, pageTargeting: true, ask: false },
      ),
      tools: [configurePageTargetingTool(pages), configureRegenerationTool(), conversationalReplyTool()],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    const call = result.data.calls.find((c) => c.toolName === 'select_pages_to_regenerate')
    expect(call).toBeDefined()
    expect((call!.toolOutput as { targetPageIds: string[] }).targetPageIds).toEqual(['page-login'])
  })

  it('a rambling but clear build request calls proceed_with_generation with a distilled brief', { timeout: 30_000 }, async () => {
    const result = await runToolLoop(generation!, {
      runId: 'benchmark:proceed',
      providerId: 'mox',
      model: MODEL,
      prompt: toolGatePrompt(
        '嗯…我昨天跟朋友聊天想到的，其实也不一定要做，但你要是能做的话——就是那种给自由职业者记账的小工具吧，' +
          '能记收入支出、看看这个月赚了多少、导出个报表报税用，手机上用。啰嗦了这么多不好意思哈。',
        { astryx: false, regeneration: false, pageTargeting: false, proceed: true, ask: false },
      ),
      tools: [proceedWithGenerationTool(), conversationalReplyTool()],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    const call = result.data.calls.find((c) => c.toolName === 'proceed_with_generation')
    expect(call).toBeDefined()
    const refined = (call!.toolOutput as { refinedBrief: string }).refinedBrief
    // A distilled, non-empty brief that dropped the rambling and kept the intent.
    expect(refined.length).toBeGreaterThan(0)
    expect(refined).not.toContain('不好意思')
  })

  it(
    'an ambiguous build request calls ask_clarifying_question, and answering resumes the same model turn',
    { timeout: 30_000 },
    async () => {
      const events: AgentRunEvent[] = []
      const runId = 'benchmark:ask'
      let resolveAsked!: (event: Extract<AgentRunEvent, { type: 'human-loop-asked' }>) => void
      const asked = new Promise<Extract<AgentRunEvent, { type: 'human-loop-asked' }>>((resolve) => {
        resolveAsked = resolve
      })
      const bridge = createClarificationBridge({
        append: (batch) => {
          events.push(...batch)
          const askEvent = batch.find((event) => event.type === 'human-loop-asked')
          if (askEvent && askEvent.type === 'human-loop-asked') resolveAsked(askEvent)
        },
      })

      const resultPromise = runToolLoop(generation!, {
        runId,
        providerId: 'mox',
        model: MODEL,
        // Deliberately vague on a decision the tool's description calls out
        // (primary user / platform) so the model has real ambiguity to ask about.
        prompt: toolGatePrompt('做一个 App', { astryx: false, regeneration: false, pageTargeting: false, ask: true }),
        tools: [askClarifyingQuestionTool(bridge, runId), conversationalReplyTool()],
        maxSteps: 4,
      })

      const askEvent = await asked
      expect(askEvent.choices.length).toBeGreaterThanOrEqual(2)
      bridge.answer(askEvent.askId, {
        kind: 'choice',
        choice: askEvent.choices.find((choice) => choice.id === askEvent.defaultChoiceId) ?? askEvent.choices[0]!,
        note: null,
      })

      const result = await resultPromise
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('expected ok')
      expect(result.data.calls.map((call) => call.toolName)).toContain('ask_clarifying_question')
      expect(events.some((event) => event.type === 'human-loop-answered')).toBe(true)
    },
  )
})
