import { classifyGenerationError } from '@/services/ai/generation-error'
import type { PackagedE2eFailureDiagnostic } from './runner'

export function packagedE2eFailureDiagnostic(message: string): PackagedE2eFailureDiagnostic {
  const lower = message.toLowerCase()
  if (lower.includes('progressive planner outline structured output failed')) {
    return 'planner-progressive-outline'
  }
  if (lower.includes('progressive planner design-foundation structured output failed')) {
    return 'planner-progressive-design-foundation'
  }
  if (lower.includes('progressive planner design-exploration structured output failed')) {
    return 'planner-progressive-design-exploration'
  }
  if (lower.includes('progressive planner design exploration violated runtime bounds')) {
    return 'planner-progressive-design-bounds'
  }
  if (lower.includes('progressive planner page structured output failed')) {
    return 'planner-progressive-page'
  }
  if (
    lower.includes('progressive planner page details changed')
    || lower.includes('progressive planner changed page')
  ) {
    return 'planner-progressive-page-identity'
  }
  if (lower.includes('progressive planner closure structured output failed')) {
    return 'planner-progressive-closure'
  }
  if (lower.includes('progressive planner merge did not match')) {
    return 'planner-progressive-merge'
  }
  if (lower.includes('progressive planner produced an invalid prototype plan')) {
    return 'planner-progressive-graph'
  }
  if (lower.includes('progressive planner did not satisfy the explicit scope')) {
    return 'planner-progressive-coverage'
  }
  if (
    lower.includes('structured json generation failed')
    || lower.includes('progressive planner')
    || lower.includes('prototype plan')
    || lower.includes('planner did not')
    || lower.includes('explicit scope')
    || lower.includes('route count')
    || lower.includes('route identity')
    || lower.includes('unreachable pages')
  ) {
    return 'planner-structured-contract'
  }
  const classification = classifyGenerationError(message)
  if (classification.kind === 'credential') return 'provider-auth'
  if (classification.kind === 'transient') return 'provider-transport'
  if (lower.includes('board decode failed')) return 'board-decode'
  if (lower.includes('board composition failed')) return 'board-composition'
  if (lower.includes('board slicing produced zero candidates')) return 'board-zero-slices'
  if (lower.includes('board slot assignment failed')) return 'board-slot-assignment'
  if (lower.includes('board artifact persistence failed')) return 'artifact-persistence'
  if (
    lower.includes('no output generated')
    || lower.includes('no object generated')
    || lower.includes('malformed response')
    || lower.includes('invalid image')
    || lower.includes('invalid media')
    || classification.kind === 'configuration'
  ) {
    return 'provider-output'
  }
  if (
    lower.includes('candidate')
    || lower.includes('design system')
    || lower.includes('prototype suite')
    || lower.includes('material production')
    || lower.includes('board slot')
    || lower.includes('board layout')
    || lower.includes('generation failed')
    || classification.kind === 'material'
    || classification.kind === 'policy'
  ) {
    return 'generation-candidate'
  }
  if (
    lower.includes('stale')
    || lower.includes('state')
    || lower.includes('transition')
    || lower.includes('selection')
    || lower.includes('workspace')
    || lower.includes('capability-required')
    || classification.kind === 'cancelled'
  ) {
    return 'orchestration-state'
  }
  return 'unknown'
}
