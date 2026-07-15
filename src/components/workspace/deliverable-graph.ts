import type { MaterialRef } from '@/agent-runtime/material-impact'

export function derivedMaterialLinks(materials: readonly MaterialRef[]): readonly { readonly sourceId: string; readonly targetId: string }[] {
  const ids = new Set(materials.map((material) => material.id))
  return materials.flatMap((material) => {
    const sourceId = material.provenance.sourcePageId
    return sourceId && ids.has(sourceId) ? [{ sourceId, targetId: material.id }] : []
  })
}
