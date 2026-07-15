export type ReviewBranchSummary = {
  readonly status?: string
  readonly comments?: readonly { readonly resolvedAt?: string }[]
  readonly approvals?: readonly { readonly decision?: string }[]
}

export function pendingReviewCount(branch: ReviewBranchSummary | undefined): number {
  if (!branch) return 0
  const comments = branch.comments?.filter((comment) => !comment.resolvedAt).length ?? 0
  const requestedChanges = branch.approvals?.filter((approval) => approval.decision === 'changes-requested').length ?? 0
  return comments + requestedChanges
}
