import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupI18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createDraft: vi.fn(),
  checkDraft: vi.fn(),
  importDraft: vi.fn(),
  cancelDraft: vi.fn(),
  upsert: vi.fn(),
  setKey: vi.fn(),
  testKey: vi.fn(),
  onDone: vi.fn(),
}))

vi.mock('@lingui/react/macro', () => ({
  Trans: ({ children }: { children: React.ReactNode }) => children,
  useLingui: () => ({ t: ({ message }: { message: string }) => message }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('uuid', () => ({ v4: () => 'provider-id' }))
vi.mock('@/services/ai/provider-verification', () => ({ setProviderVerification: vi.fn() }))
vi.mock('@/services/ai/provider-discovery', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/services/ai/provider-discovery')>(),
  createProviderDraft: mocks.createDraft,
  checkProviderDraft: mocks.checkDraft,
  importProviderDraft: mocks.importDraft,
  cancelProviderDraft: mocks.cancelDraft,
}))
vi.mock('@/hooks/queries/providers', () => ({
  useUpsertProvider: () => ({ mutateAsync: mocks.upsert, isPending: false }),
  useSetKey: () => ({ mutateAsync: mocks.setKey, isPending: false }),
  useTestKey: () => ({ mutateAsync: mocks.testKey, isPending: false }),
  useProviderStatus: () => ({ data: false }),
}))

import { ProviderForm } from './ProviderForm'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const i18n = setupI18n()
i18n.loadAndActivate({ locale: 'en', messages: {} })

describe('ProviderForm draft verification flow', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    mocks.createDraft.mockResolvedValue('provider-draft:opaque')
    mocks.checkDraft.mockResolvedValue(['gpt-5'])
    mocks.importDraft.mockResolvedValue({
      id: 'provider-id', kind: 'openai', label: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1', wireProtocol: 'responses',
      defaultModel: 'gpt-5', enabled: true,
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it('keeps save disabled until check succeeds, then uses atomic draft import', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => root.render(
      <QueryClientProvider client={queryClient}>
        <I18nProvider i18n={i18n}>
          <ProviderForm
            discovered={{
              id: 'candidate:opaque', source: 'environment', sourceLabel: 'Environment',
              kind: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1',
              wireProtocol: 'responses', modelHint: 'gpt-5',
              credential: { sourceType: 'environment', reference: 'OPENAI_API_KEY', available: true, importable: true },
              warnings: [],
            }}
            onDone={mocks.onDone}
          />
        </I18nProvider>
      </QueryClientProvider>,
    ))

    const button = (label: string) => [...host.querySelectorAll('button')]
      .find((item) => item.textContent?.includes(label)) as HTMLButtonElement | undefined
    expect(button('Add')?.disabled).toBe(true)

    await act(async () => button('Check connection and load models')?.click())
    expect(mocks.createDraft).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'openai', wireProtocol: 'responses', candidateId: 'candidate:opaque',
    }))
    expect(mocks.checkDraft).toHaveBeenCalledWith('provider-draft:opaque')
    expect(button('Add')?.disabled).toBe(false)

    const key = host.querySelector('#provider-key') as HTMLInputElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(key, 'replacement-secret')
      key.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(button('Add')?.disabled).toBe(true)
    expect(mocks.cancelDraft).toHaveBeenCalledWith('provider-draft:opaque')

    await act(async () => button('Check connection and load models')?.click())
    expect(button('Add')?.disabled).toBe(false)

    await act(async () => button('Add')?.click())
    expect(mocks.importDraft).toHaveBeenCalledWith({
      draftId: 'provider-draft:opaque', providerId: 'provider-id', label: 'OpenAI',
      defaultModel: 'gpt-5', enabled: true,
    })
    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(mocks.onDone).toHaveBeenCalledOnce()
  })
})
