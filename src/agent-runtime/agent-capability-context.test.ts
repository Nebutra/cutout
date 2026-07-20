import { describe, expect, it } from 'vitest'
import { agentCapabilityContext } from './agent-capability-context'

describe('agentCapabilityContext', () => {
  it('describes only the tools available in the current workspace', () => {
    const context = agentCapabilityContext([
      { name: 'reply_conversationally', description: 'reply' },
      { name: 'proceed_with_generation', description: 'generate' },
    ])

    expect(context).toContain('Answer questions about Cutout')
    expect(context).toContain('Generate a design system and prototype')
    expect(context).not.toContain('Astryx')
    expect(context).not.toContain('Regenerate selected existing prototype pages')
  })

  it('keeps a future registered tool truthful through its own description', () => {
    const context = agentCapabilityContext([
      { name: 'inspect_accessibility', description: 'Inspect the selected page for accessibility issues.' },
    ])

    expect(context).toContain('Inspect the selected page for accessibility issues.')
  })
})
