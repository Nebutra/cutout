import { describe, expect, it } from 'vitest'
import { discoveredProviderSourceLabel } from './discovered-provider-source'

describe('discoveredProviderSourceLabel', () => {
  it('keeps reviewed Agent sources distinct from Cutout-owned credentials', () => {
    for (const [source, sourceLabel] of [
      ['codex', 'Codex'],
      ['claude', 'Claude Code'],
      ['opencode', 'OpenCode'],
      ['pi', 'Pi Agent'],
      ['omp', 'OMP'],
      ['gemini', 'Gemini CLI'],
      ['qwen-code', 'Qwen Code'],
      ['kimi', 'Kimi Code CLI'],
      ['mistral-vibe', 'Mistral Vibe'],
    ] as const) {
      expect(discoveredProviderSourceLabel({ source, sourceLabel })).toEqual({
        kind: 'agent',
        label: sourceLabel,
      })
    }
  })

  it('reserves translated labels for environment and Cutout-owned sources', () => {
    expect(discoveredProviderSourceLabel({ source: 'environment', sourceLabel: 'Environment' }))
      .toEqual({ kind: 'environment' })
    expect(discoveredProviderSourceLabel({ source: 'cutout-keychain', sourceLabel: 'Cutout' }))
      .toEqual({ kind: 'cutout-keychain' })
  })
})
