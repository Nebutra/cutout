import { describe, expect, it } from 'vitest'
import { RegistryItemSchema } from './contracts'

const hash = 'a'.repeat(64)

export const validRegistryItem = {
  schemaVersion: 'cutout.registry-item.v1',
  id: 'acme.button',
  version: '1.2.3',
  kind: 'component',
  metadata: {
    name: 'Button',
    description: 'Accessible action primitive.',
    tags: ['action', 'form'],
  },
  files: [{ path: 'src/button.tsx', mediaType: 'text/typescript', size: 12, sha256: hash, role: 'source' }],
  designIrRefs: ['component.button'],
  tokenRefs: ['color.action.primary'],
  dependencies: [{ id: 'acme.tokens', version: '^1.0.0', kind: 'skill', optional: false }],
  frameworks: [{ id: 'react', version: '>=19', role: 'runtime' }],
  provenance: [{ id: 'prov-1', source: 'bundled', capturedAt: '2026-07-12T00:00:00.000Z', actor: 'system' }],
  license: { kind: 'spdx', identifier: 'Apache-2.0' },
  qualityReceipts: [{ gate: 'typecheck', status: 'passed', checkedAt: '2026-07-12T00:00:00.000Z', evidence: [{ sha256: hash }] }],
  previewAssets: [{ path: 'previews/button.png', mediaType: 'image/png', sha256: hash, width: 1024, height: 1024, alt: 'Button states' }],
} as const

describe('RegistryItemSchema', () => {
  it('accepts a complete registry item', () => {
    expect(RegistryItemSchema.parse(validRegistryItem).id).toBe('acme.button')
  })

  it.each(['component', 'pattern', 'template', 'starter', 'skill', 'integration-adapter'])('accepts the %s kind', (kind) => {
    expect(RegistryItemSchema.parse({ ...validRegistryItem, kind }).kind).toBe(kind)
  })

  it('rejects unknown fields, unsafe paths, malformed hashes, and duplicate files', () => {
    expect(() => RegistryItemSchema.parse({ ...validRegistryItem, surprise: true })).toThrow()
    expect(() => RegistryItemSchema.parse({ ...validRegistryItem, files: [{ ...validRegistryItem.files[0], path: '../secret' }] })).toThrow()
    expect(() => RegistryItemSchema.parse({ ...validRegistryItem, files: [{ ...validRegistryItem.files[0], sha256: 'bad' }] })).toThrow()
    expect(() => RegistryItemSchema.parse({ ...validRegistryItem, files: [validRegistryItem.files[0], validRegistryItem.files[0]] })).toThrow()
  })

  it('requires license rationale when rights are unknown', () => {
    expect(() => RegistryItemSchema.parse({ ...validRegistryItem, license: { kind: 'unknown' } })).toThrow()
  })
})
