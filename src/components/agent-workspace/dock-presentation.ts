import type { AgentWorkspaceViewModel } from './agent-view-model'

export type DockPresentationMode = 'empty' | 'active' | 'result' | 'repair'

export interface DockPresentationContext {
  readonly hasIntervention: boolean
}

export interface DockPresentation {
  readonly mode: DockPresentationMode
  readonly showOverview: boolean
  readonly showFeed: boolean
  readonly showChecklist: boolean
  readonly showIntervention: boolean
  readonly showControls: boolean
}

/**
 * Projects runtime facts into UI visibility without depending on React state.
 * Feed facts are never suppressed solely because the surrounding run is a draft.
 */
export function deriveDockPresentation(
  viewModel: AgentWorkspaceViewModel,
  context: DockPresentationContext,
): DockPresentation {
  const hasError = viewModel.feed.some((item) => item.type === 'error')
  const repairableStatus = viewModel.summary.status === 'needs-repair'
    || viewModel.summary.status === 'stopped'
    || viewModel.summary.status === 'cancelled'

  const mode: DockPresentationMode = hasError || repairableStatus
    ? 'repair'
    : context.hasIntervention || viewModel.summary.status === 'running'
      ? 'active'
      : viewModel.summary.status === 'ready'
        ? 'result'
        : 'empty'

  return {
    mode,
    showOverview: mode !== 'empty',
    showFeed: viewModel.feed.length > 0 || mode === 'active',
    showChecklist: viewModel.checklist.length > 0,
    showIntervention: context.hasIntervention,
    showControls: mode === 'active' || mode === 'repair',
  }
}
