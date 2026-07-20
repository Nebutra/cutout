import { describe, expect, it, vi } from 'vitest'
import { collectComputedStyleFacts } from './browser'
import { enumerateGovernanceScenarios, evaluateGovernance } from './governance'

const scenarios = () => enumerateGovernanceScenarios([
  { id: 'first', selector: '#first', foregroundTokenId: 'fg', backgroundTokenId: 'bg', kind: 'text', modes: ['light'], states: ['default'], lockedTokenIds: [] },
  { id: 'second', selector: '#second', foregroundTokenId: 'fg', backgroundTokenId: 'bg', kind: 'text', modes: ['light'], states: ['default'], lockedTokenIds: [] },
], new Set(['fg', 'bg']))

describe('computed browser governance evidence', () => {
  it('runs axe for a Document and attributes nodes only to the matching scenario', async () => {
    document.body.innerHTML = '<main><button id="first">First</button><button id="second">Second</button></main>'
    const axe = { run: vi.fn(async () => ({ violations: [
      { id: 'button-name', impact: 'serious' as const, nodes: [{ target: ['#first'] }] },
      { id: 'shared-ancestor', impact: 'moderate' as const, nodes: [{ target: ['body'] }] },
      { id: 'unrelated', impact: 'critical' as const, nodes: [{ target: ['body > aside'] }] },
    ] })) }

    const facts = await collectComputedStyleFacts(document, scenarios(), 'desktop', axe)

    expect(axe.run).toHaveBeenCalledWith(document)
    expect(facts[0]?.axeViolations).toEqual([{ id: 'button-name', impact: 'serious' }])
    expect(facts[1]?.axeViolations).toEqual([])
  })

  it('does not treat arbitrary text, images, SVGs, or aria labels as state-relevant non-color cues', async () => {
    document.body.innerHTML = '<button id="first" aria-label="Selected"><svg></svg>Selected</button>'
    const [scenario] = enumerateGovernanceScenarios([
      { id: 'first', selector: '#first', foregroundTokenId: 'fg', backgroundTokenId: 'bg', kind: 'color-only', modes: ['light'], states: ['selected'], lockedTokenIds: [] },
    ], new Set(['fg', 'bg']))

    const [fact] = await collectComputedStyleFacts(document, [scenario], 'desktop')

    expect(fact.nonColorCueEvidence).toEqual([])
    expect(evaluateGovernance([scenario], [fact], 1).findings).toContainEqual(expect.objectContaining({ rule: 'color-only', status: 'failed' }))
  })

  it('accepts only explicit non-color evidence attributed to the same scenario and state', async () => {
    document.body.innerHTML = '<button id="first">First</button>'
    const [scenario] = enumerateGovernanceScenarios([
      { id: 'first', selector: '#first', foregroundTokenId: 'fg', backgroundTokenId: 'bg', kind: 'color-only', modes: ['light'], states: ['selected'], lockedTokenIds: [] },
    ], new Set(['fg', 'bg']))

    const wrongState = { evidenceId: 'cue:hover', state: 'hover' as const, kind: 'icon' as const, source: 'design-ir' as const }
    const selected = { evidenceId: 'cue:selected', state: 'selected' as const, kind: 'shape' as const, source: 'human-review' as const }
    const [fact] = await collectComputedStyleFacts(document, [scenario], 'desktop', undefined, { [scenario.scenarioId]: [wrongState, selected] })

    expect(fact.nonColorCueEvidence).toEqual([selected])
    expect(evaluateGovernance([scenario], [fact], 1).findings).toContainEqual(expect.objectContaining({ rule: 'color-only', status: 'passed' }))
  })
})
