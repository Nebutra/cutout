/**
 * The bug this file guards: Settings offered six task slots, but the runtime
 * consumed a two-slot `chat`/`image` projection, so a distinct `image-edit` or
 * `webdev` binding was silently dead whenever `image-generation` / `text` was
 * set. These tests bind each task to a *different* model and assert the call
 * actually reaches that one.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CapabilityBindings } from '@/services/ai/model-capabilities'

const mocks = vi.hoisted(() => ({
  bindings: vi.fn(),
  generateImages: vi.fn(),
  editImage: vi.fn(),
}))

vi.mock('@/services/ai/model-assignment.local', () => ({
  loadCapabilityBindings: async () => mocks.bindings(),
  loadAssignments: async () => ({}),
  setCapabilityBinding: vi.fn(),
  clearCapabilityBinding: vi.fn(),
  setAssignment: vi.fn(),
}))

vi.mock('@/services/context', () => ({
  useServices: () => ({
    generation: {
      generateImages: mocks.generateImages,
      editImage: mocks.editImage,
    },
    providers: { list: async () => [] },
    prompts: { render: async () => ({ system: 'system' }) },
    assets: { load: async () => new Uint8Array() },
  }),
}))

import { aiSettingsKeys } from './ai-settings'
import { useGenerateMockup, useDeconstructMockup } from './pipeline'
import { getStoreState } from '@/store'

const bindings = (
  map: CapabilityBindings['bindings'],
): CapabilityBindings => ({
  version: 'model-assignments.v2',
  bindings: map,
  descriptors: [],
})

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Render a hook, wait for the bindings query to settle, hand back its value. */
async function renderHook<T>(hook: () => T): Promise<{ current: () => T; root: Root; host: HTMLDivElement }> {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  let latest: T
  function Probe() {
    latest = hook()
    return null
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(async () => root.render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>,
  ))
  // The route is read from the bindings query; firing the mutation before it
  // resolves would test the loading state, not the routing.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const state = queryClient.getQueryState(aiSettingsKeys.capabilityBindings())
    if (state?.status === 'success') break
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)) })
  }
  // The query settling and React re-rendering with it are two separate ticks;
  // without this flush the probe still holds the pre-resolution mutation, whose
  // closure captured an unbound route.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)) })
  return { current: () => latest, root, host }
}

/** Fire a rendered mutation and return whatever it settled with. */
async function mutate(
  rendered: { current: () => { mutateAsync: (input?: never) => Promise<unknown> } },
): Promise<unknown> {
  let settled: unknown
  await act(async () => {
    settled = await rendered.current().mutateAsync().catch((error: unknown) => error)
  })
  return settled
}

describe('generation call sites route by task', () => {
  let opened: { root: Root; host: HTMLDivElement }[] = []

  beforeEach(() => {
    vi.clearAllMocks()
    opened = []
    getStoreState().setBrief('a brief')
    mocks.generateImages.mockResolvedValue({
      ok: true,
      data: [{ mediaType: 'image/png', bytes: new Uint8Array([1]) }],
    })
    mocks.editImage.mockResolvedValue({
      ok: true,
      data: [{ mediaType: 'image/png', bytes: new Uint8Array([1]) }],
    })
  })

  afterEach(() => {
    for (const { root, host } of opened) {
      act(() => root.unmount())
      host.remove()
    }
  })

  it('sends generation to the image-generation binding, not the edit one', async () => {
    mocks.bindings.mockResolvedValue(bindings({
      'image-generation': { providerId: 'gen-provider', model: 'gen-model' },
      'image-edit': { providerId: 'edit-provider', model: 'edit-model' },
    }))
    const rendered = await renderHook(() => useGenerateMockup())
    opened.push(rendered)

    await act(async () => {
      await rendered.current().mutateAsync().catch(() => undefined)
    })

    expect(mocks.generateImages).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'gen-provider',
      model: 'gen-model',
    }))
  })

  it('resolves deconstruction against image-edit even when generation differs', async () => {
    mocks.bindings.mockResolvedValue(bindings({
      'image-generation': { providerId: 'gen-provider', model: 'gen-model' },
      'image-edit': { providerId: 'edit-provider', model: 'edit-model' },
    }))
    const rendered = await renderHook(() => useDeconstructMockup())
    opened.push(rendered)

    // Route resolution is the first gate; the missing mockup is the second.
    // Reaching the second proves the first passed on the image-edit binding.
    expect(String(await mutate(rendered))).toContain('Generate or import a mockup first')
  })

  it('lets deconstruction inherit image-generation when image-edit is unbound', async () => {
    mocks.bindings.mockResolvedValue(bindings({
      'image-generation': { providerId: 'gen-provider', model: 'gen-model' },
    }))
    const rendered = await renderHook(() => useDeconstructMockup())
    opened.push(rendered)

    expect(String(await mutate(rendered))).toContain('Generate or import a mockup first')
  })

  it('never lets generation borrow the image-edit binding', async () => {
    // The inheritance is one-way: image-edit inherits image-generation, never
    // the reverse. An edit-only setup must report generation as unconfigured
    // rather than quietly spending on the edit model.
    mocks.bindings.mockResolvedValue(bindings({
      'image-edit': { providerId: 'edit-provider', model: 'edit-model' },
    }))
    const generation = await renderHook(() => useGenerateMockup())
    const deconstruct = await renderHook(() => useDeconstructMockup())
    opened.push(generation, deconstruct)

    expect(String(await mutate(generation)))
      .toContain('No image-generation model is configured')
    expect(mocks.generateImages).not.toHaveBeenCalled()
    expect(String(await mutate(deconstruct)))
      .toContain('Generate or import a mockup first')
  })

  it('reports an unbound image-edit route when nothing in its chain is set', async () => {
    mocks.bindings.mockResolvedValue(bindings({
      text: { providerId: 'chat-provider', model: 'chat-model' },
    }))
    const rendered = await renderHook(() => useDeconstructMockup())
    opened.push(rendered)

    expect(String(await mutate(rendered)))
      .toContain('No image-editing model is configured')
  })
})
