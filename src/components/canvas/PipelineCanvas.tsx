/**
 * PipelineCanvas (spec §5 / §6/§E) — the React Flow host that replaces
 * WorkspaceLayout. It chooses the view: the fixed forward chain
 * ({@link LinearCanvas}, the default + P1 board-import path) or the AI-planned
 * graph ({@link PlannedCanvas}) once a requirement has been planned into the
 * store's `graph`. Both are flat, OPAQUE canvases per the project UI rule.
 *
 * The switch lives here so each sub-canvas owns its own React Flow hooks (node
 * state, types) without conditional-hook hazards.
 */
import { useStore } from '@/store'
import { LinearCanvas } from './LinearCanvas'
import { PlannedCanvas } from './PlannedCanvas'

export function PipelineCanvas() {
  const graph = useStore((s) => s.graph)

  return (
    <div className="min-h-0 flex-1 bg-background">
      {graph ? <PlannedCanvas graph={graph} /> : <LinearCanvas />}
    </div>
  )
}
