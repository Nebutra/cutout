import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { ProviderConfig } from './provider-types'
import { createLocalGenerationService } from './generation-service.local'
import { ok } from '@/services/types'
import { GenerationAdapterRegistry } from './provider-adapter-registry'

const { generateTextMock, generateImageMock, streamTextMock, invokeMock } =
  vi.hoisted(() => ({
    generateTextMock: vi.fn(),
    generateImageMock: vi.fn(),
    streamTextMock: vi.fn(),
    invokeMock: vi.fn(),
  }))

vi.mock('ai', () => ({
  generateText: generateTextMock,
  generateImage: generateImageMock,
  streamText: streamTextMock,
  stepCountIs: vi.fn((count: number) => ({ type: 'step-count', count })),
  hasToolCall: vi.fn((toolName: string) => ({ type: 'has-tool-call', toolName })),
  tool: vi.fn((config: unknown) => config),
  Output: {
    object: vi.fn((config: unknown) => ({ kind: 'object-output', config })),
  },
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

const cfg = (over: Partial<ProviderConfig> = {}): ProviderConfig => ({
  id: 'p1',
  kind: 'openai-compatible',
  label: 'Relay',
  defaultModel: 'chat-model',
  enabled: true,
  baseUrl: 'https://relay.example/v1',
  wireProtocol: 'chat-completions',
  ...over,
})

function providersWith(list: ProviderConfig[]) {
  return { list: () => Promise.resolve(list) }
}

const prompts = {
  render: vi.fn(async () => ({ system: 'Return the requested object.' })),
}

beforeEach(() => {
  generateTextMock.mockReset()
  generateImageMock.mockReset()
  streamTextMock.mockReset()
  invokeMock.mockReset()
  prompts.render.mockClear()
})

describe('GenerationService adapter injection',()=>{it('uses the injected registry instead of a provider-kind switch',async()=>{const model={id:'injected'},createModel=vi.fn(async()=>model),registry=new GenerationAdapterRegistry([{kind:'openai-compatible',policy:()=>({auth:'rust-keychain-proxy',headerStrategy:'openai-compatible',baseURL:'https://relay.example/v1'}),createModel}]);generateTextMock.mockResolvedValueOnce({text:'ok'});const generation=createLocalGenerationService(providersWith([cfg()]),prompts,registry);await expect(generation.generateText({providerId:'p1',prompt:'hello'})).resolves.toEqual(ok('ok'));expect(createModel).toHaveBeenCalledWith(expect.objectContaining({id:'p1'}),'chat-model');expect(generateTextMock).toHaveBeenCalledWith(expect.objectContaining({model}))})})

describe('GenerationService xAI text routing', () => {
  it('does not apply the image-model allowlist to an xAI text model', async () => {
    const model = { id: 'grok-4' }
    const createModel = vi.fn(async () => model)
    const registry = new GenerationAdapterRegistry([{
      kind: 'xai',
      policy: () => ({
        auth: 'rust-keychain-proxy',
        headerStrategy: 'openai-compatible',
        baseURL: 'https://api.x.ai/v1',
      }),
      createModel,
    }])
    generateTextMock.mockResolvedValueOnce({ text: 'ok' })
    const generation = createLocalGenerationService(providersWith([cfg({
      kind: 'xai',
      baseUrl: 'https://api.x.ai/v1',
      defaultModel: 'grok-4',
    })]), prompts, registry)

    await expect(generation.generateText({
      providerId: 'p1',
      model: 'grok-4',
      prompt: 'hello',
    })).resolves.toEqual(ok('ok'))

    expect(createModel).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), 'grok-4')
    expect(generateTextMock).toHaveBeenCalledWith(expect.objectContaining({ model }))
  })
})

describe('GenerationService.generateWithTools', () => {
  it('stops on terminal tools and applies the bounded routing model controls', async () => {
    const model = { id: 'injected' }
    const registry = new GenerationAdapterRegistry([{
      kind: 'openai-compatible',
      policy: () => ({
        auth: 'rust-keychain-proxy',
        headerStrategy: 'openai-compatible',
        baseURL: 'https://relay.example/v1',
      }),
      createModel: vi.fn(async () => model),
    }])
    generateTextMock.mockResolvedValueOnce({ text: '', steps: [] })
    const generation = createLocalGenerationService(
      providersWith([cfg({ wireProtocol: 'responses' })]),
      prompts,
      registry,
    )

    await generation.generateWithTools({
      providerId: 'p1',
      prompt: 'classify',
      tools: [],
      maxSteps: 4,
      maxOutputTokens: 1_200,
      terminalToolNames: ['proceed_with_generation'],
      reasoningEffort: 'low',
      reasoningProtocol: 'openai',
    })

    expect(generateTextMock).toHaveBeenCalledWith(expect.objectContaining({
      maxOutputTokens: 1_200,
      providerOptions: { openai: { reasoningEffort: 'low' } },
      stopWhen: [
        { type: 'step-count', count: 4 },
        { type: 'has-tool-call', toolName: 'proceed_with_generation' },
      ],
    }))
  })
})

describe('GenerationService.generateObject', () => {
  it('uses bounded OpenAI reasoning controls for an explicit Responses wire call', async () => {
    streamTextMock.mockReturnValueOnce({ output: Promise.resolve({ name: 'route' }) })
    const generation = createLocalGenerationService(
      providersWith([cfg({ wireProtocol: 'responses' })]),
      prompts,
    )

    await generation.generateObject(
      {
        providerId: 'p1',
        reasoningEffort: 'low',
        promptRef: { id: 'test-json' },
        input: [{ type: 'text', text: 'brief' }],
      },
      z.object({ name: z.string() }),
    )

    expect(streamTextMock).toHaveBeenCalledWith(expect.objectContaining({
      providerOptions: {
        openai: { reasoningEffort: 'low', strictJsonSchema: false },
      },
    }))
  })

  it('uses locally validated non-strict JSON Schema for optional/default fields', async () => {
    streamTextMock.mockReturnValueOnce({
      output: Promise.resolve({ pass: true, failures: [] }),
    })
    const generation = createLocalGenerationService(
      providersWith([cfg()]),
      prompts,
    )

    await generation.generateObject(
      {
        providerId: 'p1',
        promptRef: { id: 'test-json' },
        input: [{ type: 'text', text: 'brief' }],
      },
      z.object({
        pass: z.boolean(),
        failures: z.array(z.string()).default([]),
      }),
    )

    expect(streamTextMock).toHaveBeenCalledWith(expect.objectContaining({
      providerOptions: { openai: { strictJsonSchema: false } },
    }))
  })

  it('streams structured output and returns the final object', async () => {
    const finalObject = { name: 'dashboard' }
    streamTextMock.mockReturnValueOnce({ output: Promise.resolve(finalObject) })

    const generation = createLocalGenerationService(
      providersWith([cfg()]),
      prompts,
    )
    const schema = z.object({ name: z.string() })

    const result = await generation.generateObject(
      {
        providerId: 'p1',
        model: 'chat-model',
        maxOutputTokens: 8_000,
        promptRef: { id: 'test-json' },
        input: [{ type: 'text', text: 'brief' }],
      },
      schema,
    )

    expect(result).toEqual(ok(finalObject))
    expect(streamTextMock).toHaveBeenCalledTimes(1)
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({
          kind: 'object-output',
          config: { schema },
        }),
      }),
    )
    expect(generateTextMock).not.toHaveBeenCalled()
  })

  it('falls back to plain text JSON when structured output is not supported', async () => {
    streamTextMock
      .mockReturnValueOnce({
        output: Promise.reject(new Error('No output generated. Check the stream for errors.')),
      })
      .mockReturnValueOnce({
        toolCalls: Promise.reject(new Error('Structured tool output did not match the schema')),
      })
      .mockReturnValueOnce({
        text: Promise.resolve('```json\n{"name":"dashboard"}\n```'),
      })

    const generation = createLocalGenerationService(
      providersWith([cfg()]),
      prompts,
    )
    const schema = z.object({ name: z.string() })

    const result = await generation.generateObject(
      {
        providerId: 'p1',
        model: 'chat-model',
        maxOutputTokens: 8_000,
        promptRef: { id: 'test-json' },
        input: [{ type: 'text', text: 'brief' }],
      },
      schema,
    )

    expect(result).toEqual(ok({ name: 'dashboard' }))
    expect(streamTextMock).toHaveBeenCalledTimes(3)
    expect(generateTextMock).not.toHaveBeenCalled()
    expect(streamTextMock.mock.calls[1][0].toolChoice).toEqual({
      type: 'tool',
      toolName: 'submit_structured_output',
    })
    expect(streamTextMock.mock.calls[2][0].output).toBeUndefined()
    expect(streamTextMock.mock.calls.map(([input]) => input.maxOutputTokens)).toEqual([
      8_000,
      8_000,
      8_000,
    ])
    expect(streamTextMock.mock.calls[2][0].system).toContain(
      'Return only one valid JSON value',
    )
  })

  it('preserves nested JSON containers in the plain-text fallback', async () => {
    streamTextMock
      .mockReturnValueOnce({
        output: Promise.reject(new Error('No output generated. Check the stream for errors.')),
      })
      .mockReturnValueOnce({
        toolCalls: Promise.reject(new Error('Structured tool output did not match the schema')),
      })
      .mockReturnValueOnce({
        text: Promise.resolve([
          'Here is the requested plan:',
          '```json',
          '{"routes":[{"id":"home","regions":["hero",{"name":"cta ] }"}]}]}',
          '```',
          'Use this object exactly.',
        ].join('\n')),
      })

    const generation = createLocalGenerationService(
      providersWith([cfg()]),
      prompts,
    )
    const schema = z.object({
      routes: z.array(z.object({
        id: z.string(),
        regions: z.array(z.union([z.string(), z.object({ name: z.string() })])),
      })),
    })

    await expect(generation.generateObject(
      {
        providerId: 'p1',
        model: 'chat-model',
        promptRef: { id: 'test-json' },
        input: [{ type: 'text', text: 'brief' }],
      },
      schema,
    )).resolves.toEqual(ok({
      routes: [{
        id: 'home',
        regions: ['hero', { name: 'cta ] }' }],
      }],
    }))
    expect(streamTextMock).toHaveBeenCalledTimes(3)
  })

  it('uses a forced schema tool when provider structured output is unavailable', async () => {
    streamTextMock
      .mockReturnValueOnce({
        output: Promise.reject(new Error('No output generated. Check the stream for errors.')),
      })
      .mockReturnValueOnce({
        toolCalls: Promise.resolve([
          { toolName: 'submit_structured_output', input: { name: 'itinerary' } },
        ]),
      })

    const generation = createLocalGenerationService(
      providersWith([cfg()]),
      prompts,
    )
    const result = await generation.generateObject(
      {
        providerId: 'p1',
        promptRef: { id: 'test-json' },
        input: [{ type: 'text', text: 'brief' }],
      },
      z.object({ name: z.string() }),
    )

    expect(result).toEqual(ok({ name: 'itinerary' }))
    expect(streamTextMock).toHaveBeenCalledTimes(2)
    expect(streamTextMock.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        tools: expect.objectContaining({
          submit_structured_output: expect.objectContaining({
            inputSchema: expect.anything(),
          }),
        }),
        toolChoice: { type: 'tool', toolName: 'submit_structured_output' },
      }),
    )
    expect(generateTextMock).not.toHaveBeenCalled()
  })

  it('uses the proven buffered tool transport for a Responses provider', async () => {
    streamTextMock.mockReturnValueOnce({
      output: Promise.reject(new Error('No output generated. Check the stream for errors.')),
    })
    generateTextMock.mockResolvedValueOnce({
      toolCalls: [
        { toolName: 'submit_structured_output', input: { name: 'itinerary' } },
      ],
    })

    const generation = createLocalGenerationService(
      providersWith([cfg({ wireProtocol: 'responses' })]),
      prompts,
    )
    const result = await generation.generateObject(
      {
        providerId: 'p1',
        promptRef: { id: 'test-json' },
        input: [{ type: 'text', text: 'brief' }],
      },
      z.object({ name: z.string() }),
    )

    expect(result).toEqual(ok({ name: 'itinerary' }))
    expect(streamTextMock).toHaveBeenCalledTimes(1)
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.objectContaining({
          submit_structured_output: expect.objectContaining({
            inputSchema: expect.anything(),
          }),
        }),
        toolChoice: { type: 'tool', toolName: 'submit_structured_output' },
      }),
    )
  })

  it('remembers only explicit native-schema protocol incompatibility', async () => {
    streamTextMock
      .mockReturnValueOnce({
        output: Promise.reject(new Error('response_format is not supported')),
      })
      .mockReturnValueOnce({
        toolCalls: Promise.resolve([
          { toolName: 'submit_structured_output', input: { name: 'first' } },
        ]),
      })
      .mockReturnValueOnce({
        toolCalls: Promise.resolve([
          { toolName: 'submit_structured_output', input: { name: 'second' } },
        ]),
      })

    const generation = createLocalGenerationService(
      providersWith([cfg()]),
      prompts,
    )
    const input = {
      providerId: 'p1',
      model: 'chat-model',
      promptRef: { id: 'test-json' },
      input: [{ type: 'text' as const, text: 'brief' }],
    }
    const schema = z.object({ name: z.string() })

    await expect(generation.generateObject(input, schema)).resolves.toEqual(ok({ name: 'first' }))
    await expect(generation.generateObject(input, schema)).resolves.toEqual(ok({ name: 'second' }))

    expect(streamTextMock).toHaveBeenCalledTimes(3)
    expect(streamTextMock.mock.calls[0][0].output).toBeDefined()
    expect(streamTextMock.mock.calls[1][0].toolChoice).toBeDefined()
    expect(streamTextMock.mock.calls[2][0].toolChoice).toBeDefined()
  })

  it('does not let one schema mismatch disable native structure for later calls', async () => {
    streamTextMock
      .mockReturnValueOnce({
        output: Promise.reject(new Error('Invalid schema for response_format')),
      })
      .mockReturnValueOnce({
        toolCalls: Promise.resolve([
          { toolName: 'submit_structured_output', input: { name: 'first' } },
        ]),
      })
      .mockReturnValueOnce({
        output: Promise.resolve({ name: 'second' }),
      })

    const generation = createLocalGenerationService(
      providersWith([cfg()]),
      prompts,
    )
    const input = {
      providerId: 'p1',
      model: 'chat-model',
      promptRef: { id: 'test-json' },
      input: [{ type: 'text' as const, text: 'brief' }],
    }
    const schema = z.object({ name: z.string() })

    await expect(generation.generateObject(input, schema)).resolves.toEqual(ok({ name: 'first' }))
    await expect(generation.generateObject(input, schema)).resolves.toEqual(ok({ name: 'second' }))

    expect(streamTextMock).toHaveBeenCalledTimes(3)
    expect(streamTextMock.mock.calls[0][0].output).toBeDefined()
    expect(streamTextMock.mock.calls[1][0].toolChoice).toBeDefined()
    expect(streamTextMock.mock.calls[2][0].output).toBeDefined()
  })

  it('repairs fallback JSON when it parses but fails the schema', async () => {
    streamTextMock
      .mockReturnValueOnce({
        output: Promise.reject(new Error('Invalid JSON response')),
      })
      .mockReturnValueOnce({
        toolCalls: Promise.reject(new Error('Structured tool output did not match the schema')),
      })
      .mockReturnValueOnce({ text: Promise.resolve('{"items":[]}') })
      .mockReturnValueOnce({ text: Promise.resolve('{"items":["hero"]}') })

    const generation = createLocalGenerationService(
      providersWith([cfg()]),
      prompts,
    )
    const schema = z.object({ items: z.array(z.string()).min(1) })

    const result = await generation.generateObject(
      {
        providerId: 'p1',
        model: 'chat-model',
        promptRef: { id: 'test-json' },
        input: [{ type: 'text', text: 'brief' }],
      },
      schema,
    )

    expect(result).toEqual(ok({ items: ['hero'] }))
    expect(streamTextMock).toHaveBeenCalledTimes(4)
    expect(generateTextMock).not.toHaveBeenCalled()
    expect(streamTextMock.mock.calls[3][0].system).toContain(
      'Repair the previous JSON',
    )
    expect(streamTextMock.mock.calls[3][0].system).toContain('too_small')
    expect(streamTextMock.mock.calls[3][0].system).toContain('{"items":[]}')
  })

  it('does not retry an aborted structured stream', async () => {
    const controller = new AbortController()
    controller.abort()
    streamTextMock.mockReturnValueOnce({
      output: Promise.reject(new DOMException('Operation aborted', 'AbortError')),
    })

    const generation = createLocalGenerationService(
      providersWith([cfg()]),
      prompts,
    )

    const result = await generation.generateObject(
      {
        providerId: 'p1',
        promptRef: { id: 'test-json' },
        input: [{ type: 'text', text: 'brief' }],
        signal: controller.signal,
      },
      z.object({ name: z.string() }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe(
        'Structured output failed: native-schema=aborted.',
      )
    }
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: controller.signal }),
    )
    expect(generateTextMock).not.toHaveBeenCalled()
  })

  it.each([
    [401, 'authentication'],
    [403, 'policy'],
  ] as const)('does not retry non-structured HTTP %s failures', async (status, category) => {
    streamTextMock.mockReturnValueOnce({
      output: Promise.reject(new Error(`HTTP ${status} provider rejection`)),
    })

    const generation = createLocalGenerationService(
      providersWith([cfg()]),
      prompts,
    )

    const result = await generation.generateObject(
      {
        providerId: 'p1',
        promptRef: { id: 'test-json' },
        input: [{ type: 'text', text: 'brief' }],
      },
      z.object({ name: z.string() }),
    )

    expect(result).toEqual({
      ok: false,
      error: `Structured output failed: native-schema=${category}.`,
    })
    expect(streamTextMock).toHaveBeenCalledTimes(1)
    expect(generateTextMock).not.toHaveBeenCalled()
  })

  it.each([502, 503, 504])(
    'classifies structured HTTP %s failures as sanitized transport evidence',
    async (statusCode) => {
      const providerBody = `provider-private-body-${statusCode}: API key schema abort`
      streamTextMock
        .mockReturnValueOnce({
          output: Promise.reject(new Error('Invalid JSON response')),
        })
        .mockReturnValueOnce({
          toolCalls: Promise.reject(Object.assign(new Error('opaque sdk retry failure'), {
            errors: [Object.assign(new Error('opaque nested failure'), {
              statusCode,
              responseBody: JSON.stringify({ error: { message: providerBody } }),
            })],
          })),
        })

      const generation = createLocalGenerationService(
        providersWith([cfg()]),
        prompts,
      )
      const result = await generation.generateObject(
        {
          providerId: 'p1',
          promptRef: { id: 'test-json' },
          input: [{ type: 'text', text: 'brief' }],
        },
        z.object({ name: z.string() }),
      )

      expect(result).toEqual({
        ok: false,
        error: 'Structured output failed: native-schema=invalid-json; forced-tool=transport.',
      })
      expect(JSON.stringify(result)).not.toContain(providerBody)
      expect(streamTextMock).toHaveBeenCalledTimes(2)
      expect(generateTextMock).not.toHaveBeenCalled()
    },
  )

  it('does not infer a structured failure category from Provider response prose', async () => {
    const providerBody = 'unauthorized API key schema abort rate limit'
    streamTextMock.mockReturnValueOnce({
      output: Promise.reject(Object.assign(new Error(providerBody), {
        responseBody: JSON.stringify({ error: { message: providerBody } }),
      })),
    })

    const generation = createLocalGenerationService(
      providersWith([cfg()]),
      prompts,
    )
    const result = await generation.generateObject(
      {
        providerId: 'p1',
        promptRef: { id: 'test-json' },
        input: [{ type: 'text', text: 'brief' }],
      },
      z.object({ name: z.string() }),
    )

    expect(result).toEqual({
      ok: false,
      error: 'Structured output failed: native-schema=unknown.',
    })
    expect(JSON.stringify(result)).not.toContain(providerBody)
    expect(streamTextMock).toHaveBeenCalledTimes(1)
  })

  it('reports provider HTML responses instead of retrying JSON fallback', async () => {
    streamTextMock.mockReturnValueOnce({
      output: Promise.reject(
        Object.assign(new Error('Invalid JSON response'), {
          statusCode: 200,
          url: 'https://aigw.example.com/chat/completions',
          responseHeaders: { 'content-type': 'text/html; charset=utf-8' },
          responseBody: '<!doctype html><html><title>Mox Ai Gateway</title></html>',
        }),
      ),
    })

    const generation = createLocalGenerationService(
      providersWith([cfg()]),
      prompts,
    )

    const result = await generation.generateObject(
      {
        providerId: 'p1',
        promptRef: { id: 'test-json' },
        input: [{ type: 'text', text: 'brief' }],
      },
      z.object({ name: z.string() }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe(
        'Structured output failed: native-schema=endpoint-misconfigured.',
      )
      expect(result.error).not.toContain('aigw.example.com')
      expect(result.error).not.toContain('Mox Ai Gateway')
    }
    expect(streamTextMock).toHaveBeenCalledTimes(1)
    expect(generateTextMock).not.toHaveBeenCalled()
  })

  it('rewrites transport-level failures with the gateway host and a BYOK hint', async () => {
    streamTextMock.mockReturnValueOnce({
      output: Promise.reject(
        new Error(
          'request failed: error sending request for url (https://aigw.mox.ktvsky.com/v1/images/generations)',
        ),
      ),
    })

    const generation = createLocalGenerationService(
      providersWith([cfg()]),
      prompts,
    )

    const result = await generation.generateObject(
      {
        providerId: 'p1',
        promptRef: { id: 'test-json' },
        input: [{ type: 'text', text: 'brief' }],
      },
      z.object({ name: z.string() }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe(
        'Structured output failed: native-schema=transport.',
      )
      expect(result.error).not.toContain('aigw.mox.ktvsky.com')
    }
    expect(streamTextMock).toHaveBeenCalledTimes(1)
    expect(generateTextMock).not.toHaveBeenCalled()
  })

  it('reports every attempted structured route with closed categories only', async () => {
    streamTextMock
      .mockReturnValueOnce({
        output: Promise.reject(
          new Error('Invalid JSON response from https://secret.example/v1/responses'),
        ),
      })
      .mockReturnValueOnce({
        toolCalls: Promise.reject(
          new Error('Structured tool output did not match the schema at /private/provider.json'),
        ),
      })
      .mockReturnValueOnce({
        text: Promise.resolve('not JSON; prompt=private-planner-brief'),
      })
      .mockReturnValueOnce({ text: Promise.resolve('{"items":[]}') })

    const generation = createLocalGenerationService(
      providersWith([cfg()]),
      prompts,
    )
    const result = await generation.generateObject(
      {
        providerId: 'p1',
        promptRef: { id: 'test-json' },
        input: [{ type: 'text', text: 'brief' }],
      },
      z.object({ items: z.array(z.string()).min(1) }),
    )

    expect(result).toEqual({
      ok: false,
      error: 'Structured output failed: native-schema=invalid-json; forced-tool=schema-mismatch; text-json=invalid-json; repair-json=schema-mismatch.',
    })
    if (!result.ok) {
      expect(result.error).not.toMatch(
        /secret\.example|private\/provider|private-planner-brief|prompt=|\/v1\/responses/,
      )
    }
  })
})

describe('GenerationService.generateImages', () => {
  it('uses the native DashScope image command rather than compatible-mode text', async () => {
    invokeMock.mockResolvedValueOnce({
      images: [{ mediaType: 'image/png', data: 'QUJD' }],
    })
    const generation = createLocalGenerationService(providersWith([cfg({
      kind: 'dashscope',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      wireProtocol: 'chat-completions',
    })]), prompts)

    const result = await generation.generateImages({
      providerId: 'p1', model: 'qwen-image-2.0-pro', prompt: 'Create a launch visual.',
    })

    expect(result).toEqual(ok([{ mediaType: 'image/png', bytes: new Uint8Array([65, 66, 67]) }]))
    expect(invokeMock).toHaveBeenCalledWith('ai_dashscope_image', expect.objectContaining({
      providerId: 'p1',
      model: 'qwen-image-2.0-pro',
      operation: 'generation',
      prompt: 'Create a launch visual.',
      images: [],
    }))
  })

  it('does not silently drop reference inputs on DashScope generation', async () => {
    const generation = createLocalGenerationService(providersWith([cfg({
      kind: 'dashscope',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      wireProtocol: 'chat-completions',
    })]), prompts)
    const result = await generation.generateImages({
      providerId: 'p1',
      system: 'Edit the reference.',
      input: [{ type: 'image', image: new Uint8Array([1]) }],
    })
    expect(result).toEqual({
      ok: false,
      error: 'reference-conditioned DashScope output requires an image-edit route',
    })
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('does not invoke the Provider image endpoint when already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const generation = createLocalGenerationService(providersWith([cfg()]), prompts)

    const result = await generation.generateImages({
      providerId: 'p1',
      model: 'gpt-image-1',
      prompt: 'make an icon',
      signal: controller.signal,
    })

    expect(result).toEqual({ ok: false, error: 'Operation aborted' })
    expect(invokeMock).not.toHaveBeenCalled()
  })
  it('uses the proxied OpenAI-compatible images endpoint and parses b64_json', async () => {
    invokeMock.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: [{ b64_json: 'QUJD' }] }),
    })

    const generation = createLocalGenerationService(
      providersWith([cfg({ baseUrl: 'https://relay.example' })]),
      prompts,
    )

    const result = await generation.generateImages({
      providerId: 'p1',
      model: 'gpt-image-2',
      promptRef: { id: 'ui-mockup-generation' },
      input: [{ type: 'text', text: '政府官网' }],
    })

    expect(result).toEqual({
      ok: true,
      data: [{ mediaType: 'image/png', bytes: new Uint8Array([65, 66, 67]) }],
    })
    expect(invokeMock).toHaveBeenCalledWith(
      'ai_proxy_request',
      expect.objectContaining({
        providerId: 'p1',
        kind: 'openai-compatible',
        wireProtocol: 'chat-completions',
        url: 'https://relay.example/v1/images/generations',
        method: 'POST',
      }),
    )
    const body = JSON.parse(invokeMock.mock.calls[0][1].body)
    expect(body.model).toBe('gpt-image-2')
    expect(body.prompt).toContain('Return the requested object.')
    expect(body.prompt).toContain('政府官网')
  })

  it('uses the native images endpoint for the reviewed CC Switch provider', async () => {
    invokeMock.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: [{ b64_json: 'QUJD' }] }),
    })
    const generation = createLocalGenerationService(providersWith([cfg({
      kind: 'cc-switch',
      baseUrl: 'http://127.0.0.1:15721/v1',
      wireProtocol: 'responses',
    })]), prompts)

    const result = await generation.generateImages({
      providerId: 'p1',
      model: 'gpt-image-2',
      prompt: 'Generate one image.',
    })

    expect(result).toEqual({
      ok: true,
      data: [{ mediaType: 'image/png', bytes: new Uint8Array([65, 66, 67]) }],
    })
    expect(invokeMock).toHaveBeenCalledWith(
      'ai_proxy_request',
      expect.objectContaining({
        kind: 'cc-switch',
        wireProtocol: 'responses',
        url: 'http://127.0.0.1:15721/v1/images/generations',
      }),
    )
  })

  it('uses the documented xAI JSON generation endpoint with inline output', async () => {
    invokeMock.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: [{ b64_json: 'QUJD', mime_type: 'image/jpeg' }] }),
    })
    const generation = createLocalGenerationService(providersWith([cfg({
      kind: 'xai',
      baseUrl: 'https://api.x.ai/v1',
      wireProtocol: 'chat-completions',
      defaultModel: 'grok-imagine-image-quality',
    })]), prompts)

    const result = await generation.generateImages({
      providerId: 'p1',
      model: 'grok-imagine-image-quality',
      prompt: 'Create a dense editorial product layout.',
    })

    expect(result).toEqual(ok([{
      mediaType: 'image/jpeg',
      bytes: new Uint8Array([65, 66, 67]),
    }]))
    expect(invokeMock).toHaveBeenCalledWith('ai_proxy_request', expect.objectContaining({
      kind: 'xai',
      wireProtocol: 'chat-completions',
      url: 'https://api.x.ai/v1/images/generations',
      method: 'POST',
    }))
    expect(JSON.parse(invokeMock.mock.calls[0][1].body)).toMatchObject({
      model: 'grok-imagine-image-quality',
      prompt: 'Create a dense editorial product layout.',
      n: 1,
      response_format: 'b64_json',
    })
  })

  it('rejects non-API xAI image labels before invoking the native proxy', async () => {
    const generation = createLocalGenerationService(providersWith([cfg({
      kind: 'xai',
      baseUrl: 'https://api.x.ai/v1',
      wireProtocol: 'chat-completions',
      defaultModel: 'grok-imagine-image-quality-20260519',
    })]), prompts)

    await expect(generation.generateImages({
      providerId: 'p1',
      prompt: 'Create one image.',
    })).resolves.toEqual({
      ok: false,
      error: 'xAI image generation requires an exact documented Imagine API model id.',
    })
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('sniffs xAI JPEG output when the response omits MIME metadata', async () => {
    invokeMock.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: [{ b64_json: '/9j/4A==' }] }),
    })
    const generation = createLocalGenerationService(providersWith([cfg({
      kind: 'xai',
      baseUrl: 'https://api.x.ai/v1',
      wireProtocol: 'chat-completions',
      defaultModel: 'grok-imagine-image',
    })]), prompts)

    await expect(generation.generateImages({
      providerId: 'p1',
      prompt: 'Create one image.',
    })).resolves.toEqual(ok([{
      mediaType: 'image/jpeg',
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
    }]))
  })

  it('routes CC Switch reference conditioning through the native edit command', async () => {
    invokeMock.mockResolvedValueOnce({ images: ['QUJD'] })
    const generation = createLocalGenerationService(providersWith([cfg({
      kind: 'cc-switch',
      baseUrl: 'http://127.0.0.1:15721/v1',
      wireProtocol: 'responses',
    })]), prompts)

    const result = await generation.editImage({
      providerId: 'p1',
      model: 'gpt-image-2',
      prompt: 'Preserve the reference.',
      images: [new Uint8Array([1, 2, 3])],
    })

    expect(result).toEqual({
      ok: true,
      data: [{ mediaType: 'image/png', bytes: new Uint8Array([65, 66, 67]) }],
    })
    expect(invokeMock).toHaveBeenCalledWith(
      'ai_image_edit',
      expect.objectContaining({
        kind: 'cc-switch',
        wireProtocol: 'responses',
        baseUrl: 'http://127.0.0.1:15721/v1',
      }),
    )
  })

  it('does not route a custom Google protocol through OpenAI image generation', async () => {
    const model = { id: 'google-model' }
    const createModel = vi.fn(async () => model)
    const registry = new GenerationAdapterRegistry([{
      kind: 'openai-compatible',
      policy: () => ({ auth: 'rust-keychain-proxy', headerStrategy: 'openai-compatible', baseURL: 'https://relay.example/v1beta' }),
      createModel,
    }])
    generateTextMock.mockResolvedValueOnce({
      files: [{ mediaType: 'image/png', uint8Array: new Uint8Array([1, 2, 3]) }],
    })
    const generation = createLocalGenerationService(
      providersWith([cfg({ wireProtocol: 'google-generate-content' })]),
      prompts,
      registry,
    )

    const result = await generation.generateImages({ providerId: 'p1', prompt: 'make an icon' })

    expect(result).toEqual(ok([{ mediaType: 'image/png', bytes: new Uint8Array([1, 2, 3]) }]))
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('surfaces image endpoint HTTP failures', async () => {
    invokeMock.mockResolvedValueOnce({
      status: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: { message: 'model not supported' } }),
    })

    const generation = createLocalGenerationService(
      providersWith([cfg()]),
      prompts,
    )

    const result = await generation.generateImages({
      providerId: 'p1',
      model: 'gpt-image-2',
      promptRef: { id: 'ui-mockup-generation' },
      input: [{ type: 'text', text: 'brief' }],
    })

    expect(result).toEqual({
      ok: false,
      error: 'images/generations failed: HTTP 400 · model not supported',
    })
  })
})
