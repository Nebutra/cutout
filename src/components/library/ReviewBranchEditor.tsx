import { useEffect, useState } from 'react'
import { Check, MessageSquare, Share2 } from 'lucide-react'
import { Trans, useLingui } from '@lingui/react/macro'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CollaborationService, createIndexedDbCollaborationHost, type CollaborationHost } from '@/team-ecosystem'

export function ReviewBranchEditor({
  projectId,
  revisionId,
  host = typeof indexedDB === 'undefined' ? undefined : createIndexedDbCollaborationHost(indexedDB),
  onBranchChange,
}: {
  readonly projectId: string
  readonly revisionId: string
  readonly host?: CollaborationHost
  readonly onBranchChange?: (branch: unknown) => void
}) {
  const { t } = useLingui()
  const service = new CollaborationService(host)
  const id = `branch.${projectId}`
  const [branch, setBranch] = useState<any>()
  const [comment, setComment] = useState('')
  useEffect(() => {
    void host?.loadBranch(id).then((value) => setBranch(value ?? {
      protocol: 'cutout.review-branch.v1',
      id,
      projectId,
      baseRevisionId: revisionId,
      headRevisionId: revisionId,
      authorId: 'local.user',
      status: 'open',
      comments: [],
      approvals: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }))
  }, [host, id, projectId, revisionId])
  if (!branch) return null
  const save = (next: any) => void service.saveBranch(next).then((saved) => { setBranch(saved); onBranchChange?.(saved) })
  return (
    <section aria-label={t({ id: 'review_branch.section_aria', message: 'Review branch' })} className="space-y-3 text-xs">
      <div className="flex items-center gap-2">
        <MessageSquare className="size-4" />
        <strong>
          <Trans id="review_branch.label">Review branch</Trans>
        </strong>
        <span className="text-muted-foreground">{branch.status} · {branch.headRevisionId}</span>
      </div>
      <div className="flex gap-2">
        <Input
          aria-label={t({ id: 'review_branch.comment_aria', message: 'Review comment' })}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder={t({ id: 'review_branch.comment_placeholder', message: 'Add revision-bound comment' })}
        />
        <Button
          size="sm"
          disabled={!comment.trim()}
          onClick={() => {
            const now = new Date().toISOString()
            save({
              ...branch,
              comments: [...branch.comments, { id: `comment.${crypto.randomUUID()}`, authorId: 'local.user', body: comment, revisionId: branch.headRevisionId, createdAt: now }],
              updatedAt: now,
            })
            setComment('')
          }}
        >
          <Trans id="review_branch.comment_action">Comment</Trans>
        </Button>
      </div>
      {branch.comments.map((entry: any) => (
        <p key={entry.id} className="rounded border border-border p-2">{entry.body} · {entry.revisionId}{entry.resolvedAt ? <> · <Trans id="review_branch.resolved">resolved</Trans></> : null}</p>
      ))}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const now = new Date().toISOString()
            save({
              ...branch,
              status: 'approved',
              approvals: [...branch.approvals, { id: `approval.${crypto.randomUUID()}`, reviewerId: 'local.user', revisionId: branch.headRevisionId, decision: 'approved', createdAt: now }],
              updatedAt: now,
            })
          }}
        >
          <Check />
          <Trans id="review_branch.approve_revision">Approve revision</Trans>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void service.createShare({
            protocol: 'cutout.readonly-share.v1',
            id: `share.${crypto.randomUUID()}`,
            projectId,
            revisionId: branch.headRevisionId,
            createdBy: 'local.user',
            permission: 'view',
            createdAt: new Date().toISOString(),
          })}
        >
          <Share2 />
          <Trans id="review_branch.readonly_share">Read-only share</Trans>
        </Button>
      </div>
    </section>
  )
}
