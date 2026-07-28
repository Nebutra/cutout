import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { setupI18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const provider = {
  id: 'openai',
  kind: 'openai',
  label: 'Team OpenAI',
  defaultModel: 'gpt-5',
  enabled: true,
}

const mocks = vi.hoisted(() => ({
  providers: vi.fn(),
  bindings: vi.fn(),
  discovery: vi.fn(),
  verifications: vi.fn(),
}))

vi.mock('@lingui/react/macro', () => ({
  Trans: ({ children }: { children: React.ReactNode }) => children,
  useLingui: () => ({ t: ({ message }: { message: string }) => message }),
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useQuery: () => mocks.discovery(),
}))
vi.mock('@/hooks/queries/providers', () => ({
  useProviders: () => mocks.providers(),
  useProviderVerifications: () => mocks.verifications(),
}))
vi.mock('@/hooks/queries/ai-settings', () => ({
  useCapabilityBindings: () => mocks.bindings(),
}))
vi.mock('../ProviderRow', () => ({
  ProviderRow: ({ provider: row }: { provider: typeof provider }) => <div data-provider-row>{row.label}</div>,
}))
vi.mock('../ModelSlot', () => ({ ModelSlot: () => <div data-model-slot /> }))
vi.mock('../VectorizerPanel', () => ({ VectorizerPanel: () => <div data-vectorizer /> }))

import { AiSection } from './AiSection'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const i18n = setupI18n()
i18n.loadAndActivate({ locale: 'en', messages: {} })

describe('AiSection', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    const query = { isPending: false, isLoading: false, isError: false, refetch: vi.fn() }
    mocks.providers.mockReturnValue({ ...query, data: [provider] })
    mocks.bindings.mockReturnValue({ ...query, data: undefined })
    mocks.discovery.mockReturnValue({ ...query, data: [] })
    mocks.verifications.mockReturnValue({
      openai: {
        status: 'verified',
        model: 'gpt-5',
        checkedAt: '2026-07-28T00:00:00.000Z',
      },
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.clearAllMocks()
  })

  it('shows one ready outcome and defers management behind one disclosure', async () => {
    await act(async () => root.render(
      <I18nProvider i18n={i18n}>
        <AiSection />
      </I18nProvider>,
    ))

    expect(host.querySelector('[data-ai-setup-status="ready"]')).not.toBeNull()
    expect(host.textContent).toContain('AI is ready')
    expect(host.textContent).not.toContain('task dimensions covered')
    expect(host.textContent).not.toContain('Local coding agents')
    expect(host.querySelectorAll('details')).toHaveLength(1)
    expect(host.querySelector('[data-provider-row]')).toBeNull()

    const details = host.querySelector('details') as HTMLDetailsElement
    await act(async () => {
      details.open = true
      details.dispatchEvent(new Event('toggle', { bubbles: true }))
    })

    expect(host.querySelector('[data-provider-row]')?.textContent).toBe('Team OpenAI')
    expect(host.querySelector('[data-vectorizer]')).not.toBeNull()
    expect(host.querySelectorAll('[data-model-slot]')).toHaveLength(6)
  })
})
