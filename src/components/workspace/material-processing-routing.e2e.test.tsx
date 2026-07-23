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
import { ok, type ServiceRegistry } from '@/services/types'
import type { ModelAssignments } from '@/services/ai/model-assignment-types'
import { installE2eLocalStorage } from './intent-workspace.e2e.testkit'

const PROVIDER_ID = 'chat-only-provider'
const MODEL = 'chat-only-model'
const storage = installE2eLocalStorage()
const uploadedBytes = Uint8Array.of(82, 73, 70, 70, 9, 8, 7, 6)
const decodedImages: Blob[] = []

vi.mock('@/services/ai/model-assignment.local', () => ({
  loadAssignments: async (): Promise<ModelAssignments> => ({
    chat: { providerId: PROVIDER_ID, model: MODEL },
  }),
  setAssignment: async () => ({}),
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class OffscreenCanvasStub {
  readonly width: number
  readonly height: number
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
  }
  getContext() { return { drawImage() {} } }
  async convertToBlob() { return new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }) }
}

;(globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub
Object.defineProperty(globalThis, 'OffscreenCanvas', { configurable: true, value: OffscreenCanvasStub })
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: () => null,
})
;(globalThis as typeof globalThis & { createImageBitmap: (source: Blob) => Promise<ImageBitmap> }).createImageBitmap = async (source) => {
  if (source instanceof Blob) decodedImages.push(source)
  return { width: 16, height: 16, close() {} } as ImageBitmap
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}

async function waitFor<T>(check: () => T, timeoutMs = 5_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  let value = check()
  while (!value && Date.now() < deadline) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
    value = check()
  }
  return value
}

function registry(
  operation: 'extract-foreground' | 'split-isolated-assets' = 'split-isolated-assets',
): ServiceRegistry {
  const notUsed = async (): Promise<never> => { throw new Error('not used in this test') }
  return {
    session: { current: async () => ({ userId: 'test', isAuthenticated: false }) },
    cutout: {
      run: async () => ok({
        slices: [{
          id: 'slice-1',
          index: 0,
          box: { x: 0, y: 0, width: 8, height: 8 },
          png: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
          width: 8,
          height: 8,
        }],
      }),
    },
    foregroundSegmentation: {
      capabilities: async () => ok({ available: false, platform: 'test', backend: 'unavailable', reason: 'capability-required' }),
      segment: async () => { throw new Error('semantic segmentation was not requested') },
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
      list: async () => [{ id: PROVIDER_ID, kind: 'openai', label: 'Chat only', defaultModel: MODEL, enabled: true }],
      upsert: notUsed,
      remove: notUsed,
      setKey: notUsed,
      status: async () => ({ hasKey: true }),
      statuses: async (ids) => Object.fromEntries(ids.map((id) => [id, true])),
      test: async () => ok({ model: MODEL }),
    },
    generation: {
      generateText: notUsed,
      streamText: async function* () {},
      generateImages: notUsed,
      editImage: notUsed,
      research: notUsed,
      generateObject: notUsed,
      generateWithTools: async () => ok({
        text: '',
        toolCalls: [{
          toolCallId: 'material-decision',
          toolName: 'process_uploaded_material',
          input: {
            operation,
            rationale: operation === 'extract-foreground'
              ? 'The loaded source is an ordinary photo.'
              : 'The loaded source is an isolated asset sheet.',
          },
          output: {
            operation,
            rationale: operation === 'extract-foreground'
              ? 'The loaded source is an ordinary photo.'
              : 'The loaded source is an isolated asset sheet.',
          },
        }],
      }),
    },
    prompts: {
      list: async () => [],
      versions: notUsed,
      resolve: notUsed,
      render: async () => ({ system: 'test' }),
    },
  }
}

describe('loaded material Agent routing', () => {
  let root: Root | undefined
  let host: HTMLDivElement | undefined

  beforeEach(async () => {
    storage.clear()
    decodedImages.length = 0
    getStoreState().resetProject()
    getStoreState().loadImage({
      bitmap: { width: 16, height: 16, close() {} } as ImageBitmap,
      encodedImage: new Blob([uploadedBytes], { type: 'image/webp' }),
      name: 'sheet.png',
      autoAnalyze: false,
    })
    if (!i18n.locale) await activateLocale('en')
  })

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = undefined
    host = undefined
  })

  it('slices the loaded sheet without an image-model assignment or prototype plan', async () => {
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
                  <ServiceProvider registry={registry()}>
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

    const textarea = await waitFor(() => host!.querySelector<HTMLTextAreaElement>('[aria-label="Message the Agent"]'))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)) })
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea, '把当前上传的白底素材图切成独立 PNG')
      textarea!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const send = host.querySelector<HTMLButtonElement>('[aria-label="Send"]')!
    await act(async () => { send.click() })

    const approve = await waitFor(() => [...host!.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.trim() === 'Approve'))
    expect(approve).toBeTruthy()
    await act(async () => { approve!.click() })

    expect(await waitFor(() => getStoreState().analysis.slices.length === 1)).toBe(true)
    expect(getStoreState().workspaceSnapshot?.prototypePlan).toBeNull()
    expect(getStoreState().analysis.slices[0]).toMatchObject({
      id: 'slice-1',
      readiness: 'ready',
    })
    const routedSource = decodedImages.find((image) => image.type === 'image/webp')
    expect(routedSource).toBeDefined()
    expect(new Uint8Array(await routedSource!.arrayBuffer())).toEqual(uploadedBytes)
  }, 15_000)

  it('fails with capability-required on unsupported hosts without approval or prototype fallthrough', async () => {
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
                  <ServiceProvider registry={registry('extract-foreground')}>
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

    const textarea = await waitFor(() => host!.querySelector<HTMLTextAreaElement>('[aria-label="Message the Agent"]'))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)) })
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea, '移除这张照片的背景')
      textarea!.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { host!.querySelector<HTMLButtonElement>('[aria-label="Send"]')!.click() })

    expect(await waitFor(() => document.body.textContent?.includes('capability-required'))).toBe(true)
    expect([...host.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Approve')).toBe(false)
    expect(getStoreState().analysis.slices).toEqual([])
    expect(getStoreState().workspaceSnapshot?.prototypePlan).toBeNull()
  }, 15_000)
})
