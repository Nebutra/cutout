import { describe, expect, it } from 'vitest'
import { projectComponentReadiness } from './component-readiness'

const item = { id: 'component:manifest', label: 'Components', readiness: 'ready' as const }

describe('component readiness projection', () => {
  it('keeps screenshot inference closed and asks for a structured prototype first', () => {
    const result = projectComponentReadiness({ item, hasStructuredPrototype: false, hasTokens: true, hasExplicitCandidates: true })
    expect(result.readiness).not.toBe('ready')
    expect(result.nextAction.kind).toBe('prepare-prototype')
    expect(result.checklist[0]).toEqual({ id: 'prototype', label: 'Prepare structured prototype screens.', complete: false })
  })

  it('requires explicit candidates and tokens before governance or export', () => {
    const result = projectComponentReadiness({ item, hasStructuredPrototype: true, hasTokens: false, hasExplicitCandidates: false })
    expect(result.nextAction.kind).toBe('declare-components')
    expect(result.checklist.filter((entry) => !entry.complete).map((entry) => entry.id)).toEqual(['tokens', 'candidates'])
  })

  it('does not allow governance blockers to be bypassed', () => {
    const result = projectComponentReadiness({ item, hasStructuredPrototype: true, hasTokens: true, hasExplicitCandidates: true, governanceBlockers: ['Repair contrast evidence.'] })
    expect(result.readiness).toBe('blocked')
    expect(result.nextAction.kind).toBe('resolve-governance')
    expect(result.checklist.at(-1)?.label).toBe('Repair contrast evidence.')
  })

  it('projects preview then export while preserving raw evidence unchanged', () => {
    const evidence = { candidates: [{ props: ['size'], variants: ['primary'], slots: ['icon'], sourcePageIds: ['page:1'] }], adapterPlan: { kind: 'mapping-only' }, receipt: { id: 'receipt:1' } }
    expect(projectComponentReadiness({ item, hasStructuredPrototype: true, hasTokens: true, hasExplicitCandidates: true, hasPreview: true, advancedEvidence: evidence })).toMatchObject({ nextAction: { kind: 'preview' }, advancedEvidence: evidence })
    expect(projectComponentReadiness({ item, hasStructuredPrototype: true, hasTokens: true, hasExplicitCandidates: true }).nextAction.kind).toBe('export')
  })
})
