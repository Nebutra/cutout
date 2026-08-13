import { describe, expect, it } from 'vitest'
import { packagedE2eFailureDiagnostic } from '@/packaged-e2e/failure-diagnostic'

describe('packaged E2E production failure diagnostics', () => {
  it('classifies stale or unreadable configured Provider state without exposing ids', () => {
    expect(packagedE2eFailureDiagnostic(
      'The selected image provider is unavailable. Check that it is enabled and verified in Settings.',
    )).toBe('provider-configuration-state')
    expect(packagedE2eFailureDiagnostic(
      'The current AI configuration could not be loaded: native store unavailable',
    )).toBe('provider-configuration-state')
  })

  it.each([
    ['Board decode failed: invalid image', 'board-decode'],
    ['Board composition failed because decoded crop dimensions changed.', 'board-composition'],
    ['Board slicing produced zero candidates.', 'board-zero-slices'],
    ['Board slot assignment failed: slot is ambiguous', 'board-slot-assignment'],
    ['Board artifact persistence failed.', 'artifact-persistence'],
    ['Prototype page viewport contract failed for "home": planned 1440x900 but received 1024x1536 with a different orientation.', 'prototype-viewport'],
    ['Prototype planning timed out.', 'planner-timeout'],
    ['Prototype planner design foundation timed out.', 'planner-timeout'],
    ['Progressive planner outline structured output failed: Progressive planner outline timed out.', 'planner-timeout'],
    ['Progressive planner outline transport failed.', 'provider-transport'],
    ['Progressive planner page transport failed.', 'provider-transport'],
    ['Progressive planner page repair remained invalid: Interaction "private-id" is invalid.', 'planner-progressive-graph'],
    ['Progressive planner closure repair remained invalid: Flow "private-id" is invalid.', 'planner-progressive-graph'],
  ] as const)('classifies %s as %s', (message, expected) => {
    expect(packagedE2eFailureDiagnostic(message)).toBe(expected)
  })

  it('keeps unrelated candidate failures in the generic closed category', () => {
    expect(packagedE2eFailureDiagnostic('Prototype suite candidate failed.'))
      .toBe('generation-candidate')
  })

  it('retains explicit HTTP status authority across the packaged diagnostic boundary', () => {
    expect(packagedE2eFailureDiagnostic(
      'HTTP 429: quota for this API key is temporarily exhausted',
    )).toBe('provider-transport')
    expect(packagedE2eFailureDiagnostic(
      'HTTP 401: this API key is invalid',
    )).toBe('provider-auth')
    expect(packagedE2eFailureDiagnostic(
      'HTTP 403: this API key is blocked by policy',
    )).toBe('generation-candidate')
  })

  it('retains a closed structured transport signal instead of claiming a Planner contract failure', () => {
    expect(packagedE2eFailureDiagnostic(
      'Structured output failed: native-schema=invalid-json; forced-tool=transport.',
    )).toBe('provider-transport')
  })
})
