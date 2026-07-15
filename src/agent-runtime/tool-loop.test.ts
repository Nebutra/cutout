import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { runToolLoop, type AgentToolDefinition } from './tool-loop'
import { ok, err, type Result } from '@/services/types'
import type { GenerateWithToolsInput, GenerateWithToolsOutput, GenerationService } from '@/services/ai/types'

function fakeGeneration(
  respond: (input: GenerateWithToolsInput) => Result<GenerateWithToolsOutput>,
): Pick<GenerationService, 'generateWithTools'> {
  return { async generateWithTools(input) { return respond(input) } }
}

const echoTool: AgentToolDefinition<{ value: string }, { echoed: string }> = {
  name: 'echo',
  description: 'Echoes the given value',
  inputSchema: z.object({ value: z.string() }),
  async execute(input) {
    return { echoed: input.value }
  },
}

describe('runToolLoop', () => {
  it('falls through cleanly when the model calls no tool', async () => {
    const generation = fakeGeneration(() => ok({ text: 'Just a plain reply.', toolCalls: [] }))
    const result = await runToolLoop(generation, {
      runId: 'run:1', providerId: 'p1', prompt: 'hello', tools: [echoTool],
    })
    expect(result).toEqual({ ok: true, data: { called: false, calls: [], text: 'Just a plain reply.', events: [] } })
  })

  it('relays a successful tool call as tool-started/tool-succeeded events', async () => {
    const generation = fakeGeneration(() => ok({
      text: 'Done.',
      toolCalls: [{ toolCallId: 'call:1', toolName: 'echo', input: { value: 'hi' }, output: { echoed: 'hi' } }],
    }))
    const result = await runToolLoop(generation, {
      runId: 'run:1', providerId: 'p1', prompt: 'echo hi', tools: [echoTool],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.data.called).toBe(true)
    expect(result.data.calls).toEqual([
      { toolCallId: 'call:1', toolName: 'echo', toolInput: { value: 'hi' }, toolOutput: { echoed: 'hi' }, registered: true },
    ])
    expect(result.data.events.map((event) => event.type)).toEqual(['tool-started', 'tool-succeeded'])
    expect(result.data.events.every((event) => event.runId === 'run:1')).toBe(true)
    expect(result.data.events.every((event) => 'toolCallId' in event && event.toolCallId === 'call:1')).toBe(true)
  })

  it('records tool-failed when the model calls a tool that was never registered', async () => {
    const generation = fakeGeneration(() => ok({
      text: '',
      toolCalls: [{ toolCallId: 'call:1', toolName: 'unregistered', input: {}, output: null }],
    }))
    const result = await runToolLoop(generation, {
      runId: 'run:1', providerId: 'p1', prompt: 'do something else', tools: [echoTool],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.data.called).toBe(true)
    expect(result.data.calls).toEqual([
      { toolCallId: 'call:1', toolName: 'unregistered', toolInput: {}, toolOutput: undefined, registered: false },
    ])
    expect(result.data.events.map((event) => event.type)).toEqual(['tool-started', 'tool-failed'])
  })

  it('handles multiple tool calls in a single turn, each with its own run events', async () => {
    const otherTool: AgentToolDefinition<{ n: number }, { doubled: number }> = {
      name: 'double',
      description: 'Doubles a number',
      inputSchema: z.object({ n: z.number() }),
      async execute(input) { return { doubled: input.n * 2 } },
    }
    const generation = fakeGeneration(() => ok({
      text: 'Did both.',
      toolCalls: [
        { toolCallId: 'call:1', toolName: 'echo', input: { value: 'hi' }, output: { echoed: 'hi' } },
        { toolCallId: 'call:2', toolName: 'double', input: { n: 3 }, output: { doubled: 6 } },
      ],
    }))
    const result = await runToolLoop(generation, {
      runId: 'run:1', providerId: 'p1', prompt: 'echo hi and double 3', tools: [echoTool, otherTool],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.data.calls.map((call) => call.toolName)).toEqual(['echo', 'double'])
    expect(result.data.calls.map((call) => call.toolCallId)).toEqual(['call:1', 'call:2'])
    expect(result.data.events.map((event) => event.type)).toEqual([
      'tool-started', 'tool-succeeded', 'tool-started', 'tool-succeeded',
    ])
  })

  it('surfaces a call whose execute threw as tool-failed, not as "no tool called"', async () => {
    const generation = fakeGeneration(() => ok({
      text: '',
      toolCalls: [{
        toolCallId: 'call:1',
        toolName: 'echo',
        input: { value: 'bad' },
        output: undefined,
        error: 'execute() threw: invalid value',
      }],
    }))
    const result = await runToolLoop(generation, {
      runId: 'run:1', providerId: 'p1', prompt: 'echo bad', tools: [echoTool],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok')
    expect(result.data.called).toBe(true)
    expect(result.data.calls).toEqual([
      {
        toolCallId: 'call:1',
        toolName: 'echo',
        toolInput: { value: 'bad' },
        toolOutput: undefined,
        registered: true,
        error: 'execute() threw: invalid value',
      },
    ])
    expect(result.data.events.map((event) => event.type)).toEqual(['tool-started', 'tool-failed'])
  })

  it('propagates a generation failure without throwing', async () => {
    const generation = fakeGeneration(() => err('provider not configured'))
    const result = await runToolLoop(generation, {
      runId: 'run:1', providerId: 'p1', prompt: 'hello', tools: [echoTool],
    })
    expect(result).toEqual({ ok: false, error: 'provider not configured' })
  })

  it('defaults maxSteps to 2 when the caller omits it', async () => {
    let seenMaxSteps: number | undefined
    const generation = fakeGeneration((input) => {
      seenMaxSteps = input.maxSteps
      return ok({ text: '', toolCalls: [] })
    })
    await runToolLoop(generation, { runId: 'run:1', providerId: 'p1', prompt: 'hello', tools: [echoTool] })
    expect(seenMaxSteps).toBe(2)
  })
})
