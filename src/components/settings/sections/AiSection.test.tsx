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
  automaticSetup: vi.fn(),
  refetchQueries: vi.fn(),
}))

vi.mock('@lingui/react/macro', () => ({
  Trans: ({ children }: { children: React.ReactNode }) => children,
  useLingui: () => ({ t: ({ message }: { message: string }) => message }),
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useQuery: () => mocks.discovery(),
  useQueryClient: () => ({ refetchQueries: mocks.refetchQueries }),
}))
vi.mock('@/hooks/queries/providers', () => ({
  useProviders: () => mocks.providers(),
  useProviderVerifications: () => mocks.verifications(),
}))
vi.mock('@/hooks/queries/ai-settings', () => ({
  useCapabilityBindings: () => mocks.bindings(),
  aiSettingsKeys: {
    assignments: () => ['ai-settings', 'assignments'],
    capabilityBindings: () => ['ai-settings', 'capability-bindings'],
  },
}))
vi.mock('@/services/ai/automatic-ai-setup', () => ({
  configureAutomaticAi: (...args: unknown[]) => mocks.automaticSetup(...args),
}))
vi.mock('@/services/context', () => ({
  useServices: () => ({
    providers: { test: vi.fn() },
  }),
}))
vi.mock('../ProviderRow', () => ({
  ProviderRow: ({ provider: row }: { provider: typeof provider }) => <div data-provider-row>{row.label}</div>,
}))
vi.mock('../ModelSlot', () => ({ ModelSlot: () => <div data-model-slot /> }))
vi.mock('../VectorizerPanel', () => ({ VectorizerPanel: () => <div data-vectorizer /> }))

import { setupDuringAutomaticRefresh } from '../ai-setup-projection'
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
    mocks.bindings.mockReturnValue({
      ...query,
      data: {
        version: 'model-assignments.v2',
        bindings: {
          text: { providerId: 'openai', model: 'gpt-5' },
          vision: { providerId: 'openai', model: 'gpt-5' },
          'image-generation': { providerId: 'openai', model: 'gpt-image-2' },
          'image-edit': { providerId: 'openai', model: 'gpt-image-2' },
        },
      },
    })
    mocks.discovery.mockReturnValue({ ...query, data: [] })
    mocks.verifications.mockReturnValue({
      openai: {
        status: 'verified',
        model: 'gpt-5',
        models: ['gpt-5', 'gpt-image-2'],
        checkedAt: '2026-07-28T00:00:00.000Z',
      },
    })
    mocks.automaticSetup.mockResolvedValue({ configured: [], bindings: {} })
    mocks.refetchQueries.mockResolvedValue(undefined)
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
    expect(host.textContent).toContain('AI routes are configured')
    expect(host.textContent).toContain('Image generation is verified when the first image completes.')
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

  it('does not project ready while automatic query refresh is still pending', () => {
    const ready = { status: 'ready' as const, verifiedProviders: [provider] }
    expect(setupDuringAutomaticRefresh(ready, true)).toEqual({ status: 'checking' })
    expect(setupDuringAutomaticRefresh(ready, false)).toBe(ready)
  })

  it('refreshes both binding projections before automatic setup becomes idle', async () => {
    let releaseAssignments!: () => void
    const assignmentsRefreshed = new Promise<void>((resolve) => {
      releaseAssignments = resolve
    })
    mocks.providers.mockReturnValue({
      isPending: false,
      isLoading: false,
      isError: false,
      data: [],
      refetch: vi.fn(),
    })
    mocks.bindings.mockReturnValue({
      isPending: false,
      isLoading: false,
      isError: false,
      data: { version: 'model-assignments.v2', bindings: {} },
      refetch: vi.fn(),
    })
    mocks.discovery.mockReturnValue({
      isPending: false,
      isLoading: false,
      isError: false,
      data: [{
        id: `provider-candidate:${'a'.repeat(64)}`,
        source: 'codex',
        sourceLabel: 'Codex',
        kind: 'openai-compatible',
        label: 'Local Agent provider',
        wireProtocol: 'responses',
        credential: {
          sourceType: 'config-literal',
          available: true,
          importable: true,
        },
        warnings: [],
      }],
      refetch: vi.fn(),
    })
    mocks.verifications.mockReturnValue({})
    mocks.refetchQueries.mockImplementation(({ queryKey }: { queryKey: readonly string[] }) =>
      queryKey.at(-1) === 'assignments' ? assignmentsRefreshed : Promise.resolve())

    await act(async () => root.render(
      <I18nProvider i18n={i18n}>
        <AiSection />
      </I18nProvider>,
    ))
    await vi.waitFor(() => expect(mocks.automaticSetup).toHaveBeenCalledOnce())

    expect(mocks.refetchQueries).toHaveBeenCalledWith({
      queryKey: ['ai-settings', 'capability-bindings'],
      exact: true,
      type: 'all',
    })
    expect(mocks.refetchQueries).toHaveBeenCalledWith({
      queryKey: ['ai-settings', 'assignments'],
      exact: true,
      type: 'all',
    })
    expect(host.querySelector('[data-ai-automatic-busy="true"]')).not.toBeNull()

    releaseAssignments()
    await act(async () => assignmentsRefreshed)
    await vi.waitFor(() => {
      expect(host.querySelector('[data-ai-automatic-busy="false"]')).not.toBeNull()
    })
  })
})
