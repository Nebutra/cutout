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
      id: `provider-candidate:${'a'.repeat(64)}`,
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

    invokeMock.mockResolvedValueOnce([{ ...candidate, configLocation: '/Users/person/.codex/auth.json' }])
    await expect(discoverProviderCandidates()).rejects.toThrow('Host paths')

    invokeMock.mockResolvedValueOnce([{ ...candidate, credential: { ...candidate.credential, sourceType: 'session', importable: true } }])
    await expect(discoverProviderCandidates()).rejects.toThrow('Only available API-key sources')

    for (const unsafe of [
      { ...candidate, baseUrl: 'https://user:secret@relay.example/v1' },
      { ...candidate, baseUrl: 'https://relay.example/v1?api_key=secret' },
      { ...candidate, modelHint: 'sk-secret-model' },
      { ...candidate, label: '/Users/person/.codex/auth.json' },
      { ...candidate, credential: { ...candidate.credential, reference: 'NOT-A-VAR' } },
    ]) {
      invokeMock.mockResolvedValueOnce([unsafe])
      await expect(discoverProviderCandidates()).rejects.toThrow()
    }
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

  it('rejects ambiguous credential sources but preserves no-key local drafts', async () => {
    await expect(createProviderDraft({
      kind: 'openai', baseUrl: 'https://api.openai.com/v1', candidateId: `provider-candidate:${'d'.repeat(64)}`, secret: 'ambiguous',
    })).rejects.toThrow('Select exactly one credential source')
    expect(invokeMock).not.toHaveBeenCalled()

    invokeMock.mockResolvedValueOnce({ draftId: 'provider-draft:local', expiresInSeconds: 600 })
    await expect(createProviderDraft({ kind: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1' })).resolves.toBe('provider-draft:local')
  })

  it('accepts native Anthropic and Google protocol candidates', async () => {
    const candidates = [
      {
        id: `provider-candidate:${'b'.repeat(64)}`, source: 'claude', sourceLabel: 'Claude Code',
        kind: 'anthropic', label: 'Anthropic', wireProtocol: 'anthropic-messages',
        credential: { sourceType: 'environment', available: true, importable: true }, warnings: [],
      },
      {
        id: `provider-candidate:${'c'.repeat(64)}`, source: 'environment', sourceLabel: 'Environment',
        kind: 'google', label: 'Google', wireProtocol: 'google-generate-content',
        credential: { sourceType: 'environment', available: true, importable: true }, warnings: [],
      },
    ]
    invokeMock.mockResolvedValueOnce(candidates)
    await expect(discoverProviderCandidates()).resolves.toEqual(candidates)
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
