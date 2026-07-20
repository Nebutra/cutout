import { beforeEach, describe, expect, it, vi } from 'vitest'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

import {
  createProviderDraft,
  discoverProviderCandidates,
  importProviderDraft,
} from './provider-discovery'

describe('provider discovery native contract', () => {
  beforeEach(() => invokeMock.mockReset())

  it('accepts sanitized candidates and rejects credential-shaped output', async () => {
    const candidate = {
      id: 'provider-candidate:opaque',
      source: 'environment',
      sourceLabel: 'Process environment',
      kind: 'openai',
      label: 'OpenAI',
      wireProtocol: 'responses',
      credential: {
        sourceType: 'environment',
        reference: 'OPENAI_API_KEY',
        available: true,
        importable: true,
      },
      warnings: [],
    }
    invokeMock.mockResolvedValueOnce([candidate])
    await expect(discoverProviderCandidates()).resolves.toEqual([candidate])

    invokeMock.mockResolvedValueOnce([{ ...candidate, apiKey: 'must-not-cross-ipc' }])
    await expect(discoverProviderCandidates()).rejects.toThrow()
  })

  it('binds wire protocol when creating the checked draft', async () => {
    invokeMock.mockResolvedValueOnce({
      draftId: 'provider-draft:opaque',
      expiresInSeconds: 600,
    })

    await createProviderDraft({
      kind: 'openai-compatible',
      baseUrl: 'https://relay.example/v1',
      wireProtocol: 'chat-completions',
      secret: 'transient-only',
    })

    expect(invokeMock).toHaveBeenCalledWith('create_provider_draft', {
      input: {
        kind: 'openai-compatible',
        baseUrl: 'https://relay.example/v1',
        wireProtocol: 'chat-completions',
        secret: 'transient-only',
      },
    })
  })

  it('imports only the consumed draft identity and selected model', async () => {
    const saved = {
      id: 'provider-id',
      kind: 'openai',
      label: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      wireProtocol: 'responses',
      defaultModel: 'gpt-5',
      enabled: true,
    }
    invokeMock.mockResolvedValueOnce(saved)

    await expect(importProviderDraft({
      draftId: 'provider-draft:opaque',
      providerId: 'provider-id',
      label: 'OpenAI',
      defaultModel: 'gpt-5',
      enabled: true,
    })).resolves.toEqual(saved)
    expect(invokeMock).toHaveBeenCalledWith('import_provider_draft', {
      input: {
        draftId: 'provider-draft:opaque',
        providerId: 'provider-id',
        label: 'OpenAI',
        defaultModel: 'gpt-5',
        enabled: true,
      },
    })
  })
})
