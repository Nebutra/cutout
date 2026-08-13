export type PackagedE2eDesignCandidateOwnerStage =
  | 'queued'
  | 'preparing'
  | 'awaiting-approval'
  | 'provider-executing'
  | 'post-processing'
  | 'terminal'

export interface PackagedE2eDesignCandidateToolState {
  readonly id: string
  readonly status: 'running' | 'succeeded' | 'failed' | 'cancelled'
  readonly approvalStatus?: 'required' | 'approved' | 'denied'
}

export function projectPackagedE2eDesignCandidateOwnerStage(input: {
  readonly candidateId: string
  readonly status: 'planned' | 'generating' | 'ready' | 'failed' | 'cancelled'
  readonly tools: Readonly<Record<string, PackagedE2eDesignCandidateToolState>>
}): PackagedE2eDesignCandidateOwnerStage {
  if (input.status === 'planned') return 'queued'
  if (input.status !== 'generating') return 'terminal'

  const marker = `:design-system:${input.candidateId}:`
  const latest = Object.values(input.tools)
    .filter((tool) => tool.id.includes(marker))
    .at(-1)
  if (!latest) return 'preparing'
  if (latest.status === 'running' && latest.approvalStatus === 'required') {
    return 'awaiting-approval'
  }
  if (latest.status === 'running') return 'provider-executing'
  if (latest.status === 'succeeded') return 'post-processing'
  return 'preparing'
}
