import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { setupI18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const provider = {
  id: 'openai',
  kind: 'openai',
  label: 'Team OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  wireProtocol: 'responses' as const,
  defaultModel: 'gpt-5',
  enabled: true,
}

const mocks = vi.hoisted(() => ({
  providers: vi.fn(),
  bindings: vi.fn(),
  discovery: vi.fn(),
  runtime: vi.fn(),
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
  useQuery: ({ queryKey }: { queryKey: readonly string[] }) =>
    queryKey[0] === 'planning-runtime' ? mocks.runtime() : mocks.discovery(),
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
import { AiSection, AiSetupOverview } from './AiSection'

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
    mocks.runtime.mockReturnValue({
      ...query,
      data: {
        runtimeId: 'codex-system',
        installed: true,
        authenticated: true,
        authClass: 'chatgpt',
        capability: 'proven',
        execution: 'unproven',
        version: '0.200.0',
      },
    })
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
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('shows one ready outcome and defers management behind one disclosure', async () => {
    await act(async () => root.render(
      <I18nProvider i18n={i18n}>
        <AiSection />
      </I18nProvider>,
    ))

    expect(host.querySelector('[data-ai-setup-status="ready"]')).not.toBeNull()
    expect(host.textContent).toContain('AI ready')
    expect(host.textContent).toContain('Planning and conversation')
    expect(host.querySelectorAll('[data-ai-capability]')).toHaveLength(3)
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
    const ready = {
      status: 'ready' as const,
      verifiedProviders: [provider],
      automaticCandidates: [],
      importableCandidates: [],
      rows: [
        { capability: 'planning' as const, status: 'ready' as const, evidence: { installed: true, authenticated: true, capability: 'proven' as const, execution: 'unproven' as const } },
        { capability: 'image-generation' as const, status: 'ready' as const, evidence: { installed: true, authenticated: true, capability: 'proven' as const, execution: 'unproven' as const } },
        { capability: 'image-edit' as const, status: 'ready' as const, evidence: { installed: true, authenticated: true, capability: 'proven' as const, execution: 'unproven' as const } },
      ],
    }
    expect(setupDuringAutomaticRefresh(ready, true)).toMatchObject({
      status: 'checking',
      rows: [{ status: 'checking' }, { status: 'checking' }, { status: 'checking' }],
    })
    expect(setupDuringAutomaticRefresh(ready, false)).toBe(ready)
  })

  it('lets the user recheck every recoverable runtime blocker', async () => {
    const onRetry = vi.fn()
    await act(async () => root.render(
      <I18nProvider i18n={i18n}>
        <AiSetupOverview
          setup={{
            status: 'action-required',
            verifiedProviders: [],
            automaticCandidates: [],
            importableCandidates: [],
            rows: [
              {
                capability: 'planning',
                status: 'action-required',
                reason: 'protocol-unsupported',
                nextAction: 'upgrade-runtime',
                evidence: {
                  installed: true,
                  authenticated: true,
                  capability: 'unsupported',
                  execution: 'unproven',
                },
              },
              {
                capability: 'image-generation',
                status: 'ready',
                evidence: { installed: true, authenticated: true, capability: 'proven', execution: 'unproven' },
              },
              {
                capability: 'image-edit',
                status: 'ready',
                evidence: { installed: true, authenticated: true, capability: 'proven', execution: 'unproven' },
              },
            ],
          }}
          onConnect={vi.fn()}
          onManage={vi.fn()}
          onRetry={onRetry}
        />
      </I18nProvider>,
    ))

    const retry = [...host.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Retry'))
    expect(retry).toBeDefined()
    await act(async () => retry?.click())
    expect(onRetry).toHaveBeenCalledOnce()
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
    expect(mocks.automaticSetup.mock.calls[0]).toHaveLength(1)

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

  it('requests the exact Qwen text preference only in the packaged E2E build', async () => {
    vi.stubEnv('VITE_CUTOUT_PACKAGED_E2E', '1')
    const candidate = {
      id: `provider-candidate:${'c'.repeat(64)}`,
      source: 'cutout-keychain',
      sourceLabel: 'Cutout local credentials',
      kind: 'dashscope' as const,
      label: 'Qwen Image 3',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      wireProtocol: 'chat-completions' as const,
      modelHint: 'qwen-image-3.0',
      credential: {
        sourceType: 'keychain' as const,
        available: true,
        importable: true,
      },
      warnings: [],
    }
    const query = { isPending: false, isLoading: false, isError: false, refetch: vi.fn() }
    mocks.providers.mockReturnValue({ ...query, data: [] })
    mocks.bindings.mockReturnValue({
      ...query,
      data: { version: 'model-assignments.v2', bindings: {} },
    })
    mocks.discovery.mockReturnValue({ ...query, data: [candidate] })
    mocks.verifications.mockReturnValue({})

    await act(async () => root.render(
      <I18nProvider i18n={i18n}>
        <AiSection />
      </I18nProvider>,
    ))

    await vi.waitFor(() => {
      expect(mocks.automaticSetup).toHaveBeenCalledWith([candidate], {
        preferredTextRoutes: [{ kind: 'dashscope', model: 'qwen-plus' }],
      })
    })
  })

  it('automatically revalidates a deduplicated configured Provider candidate', async () => {
    const candidate = {
      id: `provider-candidate:${'b'.repeat(64)}`,
      source: 'cutout-keychain',
      sourceLabel: 'Cutout local credentials',
      kind: 'openai' as const,
      label: 'Team OpenAI',
      baseUrl: 'https://api.openai.com/v1/',
      wireProtocol: 'responses' as const,
      credential: {
        sourceType: 'keychain' as const,
        available: true,
        importable: true,
      },
      warnings: [],
    }
    const query = { isPending: false, isLoading: false, isError: false, refetch: vi.fn() }
    mocks.providers.mockReturnValue({ ...query, data: [provider] })
    mocks.bindings.mockReturnValue({
      ...query,
      data: { version: 'model-assignments.v2', bindings: {} },
    })
    mocks.discovery.mockReturnValue({ ...query, data: [candidate] })
    mocks.verifications.mockReturnValue({})

    await act(async () => root.render(
      <I18nProvider i18n={i18n}>
        <AiSection />
      </I18nProvider>,
    ))

    await vi.waitFor(() => {
      expect(mocks.automaticSetup).toHaveBeenCalledWith([candidate])
    })
  })

  it('renders a bounded Tauri rejection message instead of an object coercion', async () => {
    const query = { isPending: false, isLoading: false, isError: false, refetch: vi.fn() }
    mocks.providers.mockReturnValue({ ...query, data: [] })
    mocks.bindings.mockReturnValue({
      ...query,
      data: { version: 'model-assignments.v2', bindings: {} },
    })
    mocks.discovery.mockReturnValue({
      ...query,
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
    })
    mocks.verifications.mockReturnValue({})
    mocks.automaticSetup.mockRejectedValue({
      code: 'credential-unavailable',
      message: 'The native credential is no longer available.',
    })

    await act(async () => root.render(
      <I18nProvider i18n={i18n}>
        <AiSection />
      </I18nProvider>,
    ))

    await vi.waitFor(() => {
      expect(host.querySelector('[role="alert"]')?.textContent)
        .toBe('The native credential is no longer available.')
    })
    expect(host.textContent).not.toContain('[object Object]')
  })
})
