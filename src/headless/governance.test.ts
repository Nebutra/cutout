import { describe, expect, it } from 'vitest'
import { runHeadlessGovernance } from './governance'
import type { GovernanceInput, StandardGovernancePolicy } from '@/design-governance'

const policy: StandardGovernancePolicy = { version: 'design-governance-policy.v1', id: 'policy.default', standards: { wcag: '2.2', dtcg: '2025.10', cssColor: '4' }, severity: {}, thresholds: { perceptualDeltaE: 5, spacingBase: 4, maxMotionMs: 500, minFocusArea: 4 } }
const input: GovernanceInput = { documentId: 'design.one', revisionId: 'revision.one', tokens: [], completedAt: '2026-07-12T00:00:00.000Z', samples: [{ kind: 'text', id: 'body', foreground: '#777', background: '#fff', fontSizePx: 16, fontWeight: 400, location: { entityId: 'component.body', path: 'styles.default' } }] }

describe('headless governance harness', () => {
  it('uses one report for preview, validation, and full reporting', () => {
    const preview = runHeadlessGovernance(input, policy, 'preview')
    const validation = runHeadlessGovernance(input, policy, 'validate')
    const report = runHeadlessGovernance(input, policy, 'report')
    expect(preview).toMatchObject({ protocol: 'cutout.governance-harness.v1', mode: 'preview', summary: { blocking: true }, ruleIds: ['wcag.text.normal'] })
    expect(validation).toMatchObject({ mode: 'validate', findings: [{ ruleId: 'wcag.text.normal' }] })
    expect(validation.findings[0]).not.toHaveProperty('evidence')
    expect(report).toMatchObject({ mode: 'report', report: { protocol: 'design-governance-report.v1', summary: { blocking: true } } })
  })
})
