import { describe, expect, it } from 'vitest'
import { packagedE2eFailureDiagnostic } from '@/packaged-e2e/failure-diagnostic'

describe('packaged E2E production failure diagnostics', () => {
  it.each([
    ['Board decode failed: invalid image', 'board-decode'],
    ['Board composition failed because decoded crop dimensions changed.', 'board-composition'],
    ['Board slicing produced zero candidates.', 'board-zero-slices'],
    ['Board slot assignment failed: slot is ambiguous', 'board-slot-assignment'],
    ['Board artifact persistence failed.', 'artifact-persistence'],
  ] as const)('classifies %s as %s', (message, expected) => {
    expect(packagedE2eFailureDiagnostic(message)).toBe(expected)
  })

  it('keeps unrelated candidate failures in the generic closed category', () => {
    expect(packagedE2eFailureDiagnostic('Prototype suite candidate failed.'))
      .toBe('generation-candidate')
  })
})
