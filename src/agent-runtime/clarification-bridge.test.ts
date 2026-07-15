import { describe, expect, it } from 'vitest'
import { createClarificationBridge } from './clarification-bridge'
import { isAgentRunCancelled } from './run-coordinator'
import type { AgentRunEvent } from './run-events'
import type { PrototypeHumanLoopAsk } from '@/prototype/prototype-plan'

const QUESTION: PrototypeHumanLoopAsk = {
  mode: 'ask',
  rationale: 'Platform is ambiguous.',
  question: 'Which platform should this target?',
  choices: [
    { id: 'web', label: 'Web', description: 'Responsive web app.', impact: 'Optimizes for browser layouts.' },
    { id: 'mobile', label: 'Mobile', description: 'Native mobile app.', impact: 'Optimizes for touch layouts.' },
  ],
  defaultChoiceId: 'web',
}

function collector() {
  const events: AgentRunEvent[] = []
  return { append: (batch: readonly AgentRunEvent[]) => events.push(...batch), events }
}

describe('createClarificationBridge', () => {
  it('emits human-loop-asked immediately, before the ask resolves', () => {
    const { append, events } = collector()
    const bridge = createClarificationBridge({ append })
    void bridge.ask('run:1', QUESTION)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'human-loop-asked', runId: 'run:1', question: QUESTION.question })
  })

  it('answer() resolves the matching ask and emits human-loop-answered', async () => {
    const { append, events } = collector()
    const bridge = createClarificationBridge({ append })
    const pending = bridge.ask('run:1', QUESTION)
    const askEvent = events.find((event) => event.type === 'human-loop-asked')
    if (!askEvent || askEvent.type !== 'human-loop-asked') throw new Error('expected human-loop-asked')

    bridge.answer(askEvent.askId, { kind: 'choice', choice: QUESTION.choices[1]!, note: null })
    const answer = await pending
    expect(answer).toEqual({ kind: 'choice', choice: QUESTION.choices[1], note: null })
    expect(events.filter((event) => event.type === 'human-loop-answered')).toHaveLength(1)
  })

  it('answer() with an unknown askId is a no-op', () => {
    const { append } = collector()
    const bridge = createClarificationBridge({ append })
    expect(() => bridge.answer('unknown', { kind: 'custom', text: 'anything' })).not.toThrow()
  })

  it('answer() called twice for the same askId only resolves once, second call is a no-op', async () => {
    const { append, events } = collector()
    const bridge = createClarificationBridge({ append })
    const pending = bridge.ask('run:1', QUESTION)
    const askEvent = events.find((event) => event.type === 'human-loop-asked')
    if (!askEvent || askEvent.type !== 'human-loop-asked') throw new Error('expected human-loop-asked')

    bridge.answer(askEvent.askId, { kind: 'custom', text: 'first' })
    bridge.answer(askEvent.askId, { kind: 'custom', text: 'second' })
    await expect(pending).resolves.toEqual({ kind: 'custom', text: 'first' })
    expect(events.filter((event) => event.type === 'human-loop-answered')).toHaveLength(1)
  })

  it('rejects with AgentRunCancelledError when the signal aborts, and cleans up the pending ask', async () => {
    const { append } = collector()
    const bridge = createClarificationBridge({ append })
    const controller = new AbortController()
    const pending = bridge.ask('run:1', QUESTION, controller.signal)
    controller.abort()
    await expect(pending).rejects.toSatisfy((error: unknown) => isAgentRunCancelled(error))

    // Cleaned up: answering the same (leaked) askId afterward must not resolve anything or throw.
    expect(() => bridge.answer('whatever-id', { kind: 'custom', text: 'too late' })).not.toThrow()
  })

  it('throws synchronously if the signal is already aborted before ask() is called', () => {
    const { append } = collector()
    const bridge = createClarificationBridge({ append })
    const controller = new AbortController()
    controller.abort()
    expect(() => bridge.ask('run:1', QUESTION, controller.signal)).toThrow()
  })
})
