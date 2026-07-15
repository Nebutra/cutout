import type { DesignOsDeliverableItem, DesignOsReadiness } from './DesignOsWorkbench'

export type ComponentNextAction = 'prepare-prototype' | 'declare-components' | 'resolve-governance' | 'preview' | 'export'

export interface ComponentReadinessInput {
  readonly item?: DesignOsDeliverableItem
  readonly hasStructuredPrototype: boolean
  readonly hasTokens: boolean
  readonly hasExplicitCandidates: boolean
  readonly governanceBlockers?: readonly string[]
  readonly hasPreview?: boolean
  readonly advancedEvidence?: unknown
}

export interface ComponentReadinessSummary {
  readonly readiness: DesignOsReadiness
  readonly checklist: readonly { readonly id: string; readonly label: string; readonly complete: boolean }[]
  readonly nextAction: { readonly kind: ComponentNextAction; readonly label: string }
  readonly advancedEvidence: unknown
}

export function projectComponentReadiness(input: ComponentReadinessInput): ComponentReadinessSummary {
  const governance = [...new Set(input.governanceBlockers ?? [])]
  const checklist = [
    { id: 'prototype', label: 'Prepare structured prototype screens.', complete: input.hasStructuredPrototype },
    { id: 'tokens', label: 'Approve the design tokens used by components.', complete: input.hasTokens },
    { id: 'candidates', label: 'Explicitly declare the reusable components.', complete: input.hasExplicitCandidates },
    ...governance.map((label, index) => ({ id: `governance:${index}`, label, complete: false })),
  ]
  let kind: ComponentNextAction
  if (!input.hasStructuredPrototype) kind = 'prepare-prototype'
  else if (!input.hasTokens || !input.hasExplicitCandidates) kind = 'declare-components'
  else if (governance.length) kind = 'resolve-governance'
  else if (input.hasPreview) kind = 'preview'
  else kind = 'export'
  const labels: Record<ComponentNextAction, string> = {
    'prepare-prototype': 'Prepare prototype',
    'declare-components': 'Declare components',
    'resolve-governance': 'Resolve governance issues',
    preview: 'Approve and continue',
    export: 'Preview and export',
  }
  const ready = Boolean(input.item?.readiness === 'ready' && input.hasStructuredPrototype && input.hasTokens && input.hasExplicitCandidates && !governance.length)
  return {
    readiness: ready ? 'ready' : input.item ? 'blocked' : 'unavailable',
    checklist,
    nextAction: { kind, label: labels[kind] },
    advancedEvidence: input.advancedEvidence ?? {
      candidateDeclarations: null,
      manifest: input.item,
    },
  }
}
