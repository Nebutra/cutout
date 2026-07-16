import type { MaterialRef } from '@/agent-runtime/material-impact'

export interface CanvasSelectionDetails {
  readonly title: string
  readonly kind: 'Prototype page' | 'Design system' | 'Asset'
  readonly status: 'Ready'
  readonly source: 'Agent generation' | 'Page extraction'
  readonly version: string
  readonly actionLabel: 'Modify with Agent'
}

export function projectCanvasSelection(
  material: MaterialRef | null,
): CanvasSelectionDetails | null {
  if (!material) return null
  return {
    title: material.label,
    kind:
      material.kind === 'prototype-page'
        ? 'Prototype page'
        : material.kind === 'design-system'
          ? 'Design system'
          : 'Asset',
    status: 'Ready',
    source:
      material.provenance.source === 'prototype-generation'
        ? 'Agent generation'
        : 'Page extraction',
    version: material.version,
    actionLabel: 'Modify with Agent',
  }
}
