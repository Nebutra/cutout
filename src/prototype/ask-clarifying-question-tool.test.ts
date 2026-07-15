import { describe, expect, it } from 'vitest'
import { askClarifyingQuestionTool, askClarifyingQuestionInputSchema } from './ask-clarifying-question-tool'
import { createClarificationBridge } from '@/agent-runtime/clarification-bridge'
import type { AgentRunEvent } from '@/agent-runtime/run-events'

const RAW_INPUT = {
  question: 'Which platform should this target?',
  choices: [
    { id: 'web', label: 'Web', description: 'Responsive web app.', impact: 'Optimizes for browser layouts.' },
    { id: 'mobile', label: 'Mobile', description: 'Native mobile app.', impact: 'Optimizes for touch layouts.' },
  ],
  defaultChoiceId: 'web',
  rationale: 'The brief never mentions a platform.',
}

describe('askClarifyingQuestionTool', () => {
  it('rejects fewer than 2 choices via its input schema', () => {
    const result = askClarifyingQuestionInputSchema.safeParse({ ...RAW_INPUT, choices: [RAW_INPUT.choices[0]] })
    expect(result.success).toBe(false)
  })

  it('is marked read-only', () => {
    const bridge = createClarificationBridge({ append: () => undefined })
    expect(askClarifyingQuestionTool(bridge, 'run:1').isReadOnly).toBe(true)
  })

  it('execute() suspends via the bridge and returns exactly what answer() resolves', async () => {
    const events: AgentRunEvent[] = []
    const bridge = createClarificationBridge({ append: (batch) => events.push(...batch) })
    const tool = askClarifyingQuestionTool(bridge, 'run:1')
    const input = tool.inputSchema.parse(RAW_INPUT)

    const pending = tool.execute(input)
    const askEvent = events.find((event) => event.type === 'human-loop-asked')
    if (!askEvent || askEvent.type !== 'human-loop-asked') throw new Error('expected human-loop-asked')
    expect(askEvent.question).toBe(RAW_INPUT.question)

    bridge.answer(askEvent.askId, { kind: 'choice', choice: RAW_INPUT.choices[1]!, note: null })
    await expect(pending).resolves.toEqual({ kind: 'choice', choice: RAW_INPUT.choices[1], note: null })
  })

  it('execute() rejects when the passed signal aborts before an answer arrives', async () => {
    const bridge = createClarificationBridge({ append: () => undefined })
    const controller = new AbortController()
    const tool = askClarifyingQuestionTool(bridge, 'run:1', controller.signal)
    const input = tool.inputSchema.parse(RAW_INPUT)

    const pending = tool.execute(input)
    controller.abort()
    await expect(pending).rejects.toBeDefined()
  })
})
