import { describe, expect, it, vi } from 'vitest'
import { createInMemoryRuntimeStore, createHeadlessRuntime, type HeadlessProjectState, type RuntimeStore } from './index'
import type { BrandKitInput } from '@/brand-kit'

const SHA = 'd'.repeat(64)
const TIME = '2026-07-11T00:00:00.000Z'

function state(): HeadlessProjectState {
  const design = {
    version: 'design-ir.v1' as const,
    meta: { id: 'brand-project', title: 'Brand project', createdAt: TIME, updatedAt: TIME },
    revision: { id: 'brand-r1', number: 1, createdAt: TIME, author: { kind: 'human' as const, id: 'designer' } },
    needs: [],
    sources: [
      { id: 'logo-source', kind: 'document' as const, role: 'brand-asset' as const, title: 'Approved logo', license: { kind: 'proprietary' as const, holder: 'Brand Co' }, content: [{ id: 'logo-content', uri: `sha256:${SHA}`, sha256: SHA, mediaType: 'image/svg+xml' }] },
      { id: 'guide-source', kind: 'document' as const, role: 'evidence' as const, title: 'Approved guide', license: { kind: 'proprietary' as const, holder: 'Brand Co' }, content: [{ id: 'guide-content', uri: `sha256:${SHA}`, sha256: SHA, mediaType: 'text/markdown' }] },
    ],
    brands: [{ id: 'brand:co', name: 'Brand Co', status: 'active' as const, provenanceId: 'logo-import' }],
    tokens: [], components: [], materials: [],
    provenance: [
      { id: 'logo-import', operation: 'import' as const, sourceIds: ['logo-source'], actor: { kind: 'human' as const, id: 'designer' }, recordedAt: TIME },
      { id: 'guide-import', operation: 'import' as const, sourceIds: ['guide-source'], actor: { kind: 'human' as const, id: 'designer' }, recordedAt: TIME },
    ],
    relations: [],
  }
  return {
    manifest: { version: 'cutout.manifest.v1', project: { id: 'brand-project', name: 'Brand project' }, files: { designIr: 'design-ir.json', designMarkdown: 'DESIGN.md', artifactIndex: 'artifacts.json', policy: 'policy.json', controlLedger: 'control-ledger.json' } },
    design,
    designMarkdown: '# Brand project',
    artifactIndex: { version: 'cutout.artifacts.v1', artifacts: [] },
    policy: { version: 'cutout.policy.v1', allowApply: true, allowedOperations: ['project.context', 'export.brand-kit'], requireApprovalForExternal: true },
  }
}

function input(document = state().design): BrandKitInput {
  const logo = { sourceId: 'logo-source', contentId: 'logo-content', provenanceId: 'logo-import' }
  const guide = { sourceId: 'guide-source', contentId: 'guide-content', provenanceId: 'guide-import' }
  return {
    document,
    brand: {
      brandId: 'brand:co', logo: { variants: [{ id: 'logo-primary', label: 'Primary', kind: 'primary', evidence: logo }] },
      clearspace: { rule: 'One cap height.', evidence: guide }, minSize: [{ logoId: 'logo-primary', width: 24, unit: 'px', evidence: guide }],
      colors: [{ id: 'color-primary', name: 'Primary', cssName: 'primary', value: '#0EA5E9', evidence: guide }],
      type: [{ id: 'type-body', role: 'body', family: 'Brand Sans', evidence: logo }],
      icon: { guidance: 'Use round strokes.', evidence: guide }, photo: { guidance: 'Use approved photography.', evidence: guide }, voice: { guidance: 'Be concise.', evidence: guide },
      assetRecipes: [{ id: 'og-image', name: 'Open Graph', kind: 'social-image', instructions: 'Use the approved logo.', evidence: guide }],
    },
  }
}

function request(operation: unknown, overrides: Record<string, unknown> = {}) {
  return { protocol: 'cutout.control.v1', requestId: 'brand-export', expectedRevision: 0, mode: 'apply', operation, ...overrides }
}

describe('Brand Kit headless export', () => {
  it('uses only an explicit input that proves equivalence to the persisted DesignDocument', async () => {
    const writeBrandKit = vi.fn(async () => ({ directory: '.cutout/exports/brand-kit/receipt', idempotent: false }))
    const store = Object.assign(createInMemoryRuntimeStore(state()), { writeBrandKit }) as RuntimeStore & { writeBrandKit: typeof writeBrandKit }
    const runtime = createHeadlessRuntime(store)

    const preview = await runtime.execute(request({ type: 'export.brand-kit', input: input() }, { mode: 'dry-run' }))
    expect(preview).toMatchObject({ status: 'ok', dryRun: true, result: { directory: expect.stringMatching(/^\.cutout\/exports\/brand-kit\//), files: expect.any(Array), apply: { requiresApproval: true } } })
    expect(writeBrandKit).not.toHaveBeenCalled()

    const missingApproval = await runtime.execute(request({ type: 'export.brand-kit', input: input() }, { requestId: 'missing-approval' }))
    expect(missingApproval).toMatchObject({ status: 'denied', error: { code: 'approval-required' } })

    const applied = await runtime.execute(request({ type: 'export.brand-kit', input: input() }, { requestId: 'approved', approval: { id: 'human-approved', grantedAt: 1 } }))
    expect(applied).toMatchObject({ status: 'ok', revision: 1, result: { directory: '.cutout/exports/brand-kit/receipt' } })
    expect(writeBrandKit).toHaveBeenCalledTimes(1)

    const mismatched = input()
    mismatched.document = { ...mismatched.document, meta: { ...mismatched.document.meta, title: 'Untrusted copy' } }
    const rejected = await runtime.execute(request({ type: 'export.brand-kit', input: mismatched }, { requestId: 'mismatch', expectedRevision: 1, approval: { id: 'human-approved-2', grantedAt: 2 } }))
    expect(rejected).toMatchObject({ status: 'invalid', error: { code: 'invalid-request', message: expect.stringContaining('does not match') } })
    expect(writeBrandKit).toHaveBeenCalledTimes(1)
  })
})
