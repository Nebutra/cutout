import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AlertCircle, Check, ChevronRight, GitBranch, History, Loader2, PanelLeftClose, Plus, RefreshCw, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import { useSettingsUI } from '@/components/settings/settings-ui'
import { getAuthorizedWorkspace, setAuthorizedWorkspace } from '@/platform/authorized-workspace'
import { tauriBridge, type GitBranchComparison, type GitBranchSummary, type GitCommitFile, type GitCommitSummary, type GitDiffResult, type GitMutation, type GitMutationPreview, type GitPushPreview, type GitStatusSnapshot } from '@/platform/native'

type View = 'changes' | 'history' | 'branches' | 'pull-requests'
export type GitWorkspaceReview =
  | { readonly type: 'diff'; readonly diff: GitDiffResult }
  | { readonly type: 'commit'; readonly commit: GitCommitSummary; readonly files: readonly GitCommitFile[]; readonly onSelectFile: (path: string) => void }
  | { readonly type: 'branch'; readonly comparison: GitBranchComparison }

function getGitBridge() {
  const { authorizeWorkspace, gitCapability, gitStatus, gitLog, gitCommitFiles, gitCommitDiff, gitBranches, gitBranchCompare, gitDiff, gitStage, gitUnstage, gitPreviewMutation, gitApplyMutation, gitPushPreview, gitPush } = tauriBridge
  if (!authorizeWorkspace || !gitCapability || !gitStatus || !gitLog || !gitCommitFiles || !gitCommitDiff || !gitBranches || !gitBranchCompare || !gitDiff || !gitStage || !gitUnstage || !gitPreviewMutation || !gitApplyMutation || !gitPushPreview || !gitPush) return undefined
  return { authorizeWorkspace, gitCapability, gitStatus, gitLog, gitCommitFiles, gitCommitDiff, gitBranches, gitBranchCompare, gitDiff, gitStage, gitUnstage, gitPreviewMutation, gitApplyMutation, gitPushPreview, gitPush }
}

export function GitWorkspaceDock({ onClose, onReview }: { readonly onClose: () => void; readonly onReview?: (review: GitWorkspaceReview | undefined) => void }) {
  const settings = useSettingsUI()
  const [workspace, setWorkspace] = useState(getAuthorizedWorkspace)
  const [view, setView] = useState<View>('changes')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string>()
  const [receipt, setReceipt] = useState<string>()
  const [status, setStatus] = useState<GitStatusSnapshot>()
  const [commits, setCommits] = useState<GitCommitSummary[]>([])
  const [historyComplete, setHistoryComplete] = useState(false)
  const [branches, setBranches] = useState<GitBranchSummary[]>([])
  const [diff, setDiff] = useState<GitDiffResult>()
  const [commitMessage, setCommitMessage] = useState('')
  const [branchName, setBranchName] = useState('')
  const [creatingBranch, setCreatingBranch] = useState(false)
  const [busyAction, setBusyAction] = useState<string>()
  const [pushPreview, setPushPreview] = useState<GitPushPreview>()
  const [pendingMutation, setPendingMutation] = useState<GitMutationPreview>()

  const applyStatus = useCallback((nextStatus: GitStatusSnapshot) => {
    setStatus(nextStatus)
    setDiff(undefined)
    onReview?.(undefined)
  }, [onReview])

  const refresh = useCallback(async () => {
    if (!workspace) return
    setLoading(true)
    setMessage(undefined)
    try {
      const bridge = getGitBridge()
      if (!bridge) throw new Error('Git requires the Cutout desktop host.')
      const capability = await bridge.gitCapability(workspace.handle)
      if (!capability.available || !capability.repository) {
        setMessage(capability.message ?? 'Git repository is unavailable.')
        setStatus(undefined)
        return
      }
      const nextStatus = await bridge.gitStatus(workspace.handle)
      setStatus(nextStatus)
      const [nextCommits, nextBranches] = await Promise.all([
        bridge.gitLog(workspace.handle, 100, 0),
        bridge.gitBranches(workspace.handle),
      ])
      setCommits(nextCommits)
      setHistoryComplete(nextCommits.length < 100)
      setBranches(nextBranches)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }, [workspace])

  const mutate = async (label: string, operation: (bridge: NonNullable<ReturnType<typeof getGitBridge>>, handle: string, snapshot: GitStatusSnapshot) => Promise<GitStatusSnapshot>) => {
    if (!workspace || !status) return
    const bridge = getGitBridge()
    if (!bridge) {
      setMessage('Git requires the Cutout desktop host.')
      return
    }
    setBusyAction(label)
    setMessage(undefined)
    setReceipt(undefined)
    try {
      applyStatus(await operation(bridge, workspace.handle, status))
      const [nextCommits, nextBranches] = await Promise.all([bridge.gitLog(workspace.handle, 100, 0), bridge.gitBranches(workspace.handle)])
      setCommits(nextCommits)
      setHistoryComplete(nextCommits.length < 100)
      setBranches(nextBranches)
      setReceipt(label === 'commit' ? 'Commit completed and repository state verified.' : label === 'create-branch' ? 'Branch created and repository state verified.' : label.startsWith('switch:') ? 'Branch switched and repository state verified.' : label === 'push' ? 'Push completed and repository state verified.' : 'Repository state verified.')
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : String(error)
      await refresh()
      setMessage(nextMessage)
    } finally {
      setBusyAction(undefined)
    }
  }

  const previewPush = async () => {
    if (!workspace || !status) return
    const bridge = getGitBridge()
    if (!bridge) return
    setBusyAction('push-preview')
    setMessage(undefined)
    try {
      setPushPreview(await bridge.gitPushPreview(workspace.handle, status.snapshotToken))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyAction(undefined)
    }
  }

  useEffect(() => { void refresh() }, [refresh])

  const chooseRepository = async () => {
    setLoading(true)
    setMessage(undefined)
    try {
      const bridge = getGitBridge()
      if (!bridge) throw new Error('Git requires the Cutout desktop host.')
      const result = await bridge.authorizeWorkspace()
      if (!result.canceled && result.handle) {
        const next = { handle: result.handle, label: result.label ?? undefined }
        setAuthorizedWorkspace(next)
        setWorkspace(next)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-background" aria-label="Git">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <GitBranch className="size-4" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">Git</div>
          {status ? <div className="truncate text-[11px] text-muted-foreground">{status.detached ? 'Detached HEAD' : status.branch ?? 'No branch'}{status.ahead ? ` · ↑${status.ahead}` : ''}{status.behind ? ` · ↓${status.behind}` : ''}</div> : null}
        </div>
        {status && !status.detached ? <button type="button" className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => void previewPush()} disabled={Boolean(busyAction)}><Upload className="size-3.5" />Push</button> : null}
        <button type="button" className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Refresh Git" onClick={() => void refresh()} disabled={loading}><RefreshCw className={cn('size-4', loading && 'animate-spin')} /></button>
        <button type="button" className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Hide Git" onClick={onClose}><PanelLeftClose className="size-4" /></button>
      </header>

      <div className="grid shrink-0 grid-cols-4 border-b border-border p-1">
        {([['changes', 'Changes'], ['history', 'History'], ['branches', 'Branches'], ['pull-requests', 'PRs']] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={view === id} className={cn('rounded-md px-1 py-1.5 text-xs text-muted-foreground hover:text-foreground', view === id && 'bg-muted text-foreground')} onClick={() => setView(id)}>{label}</button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {!workspace ? <Empty title="Open a local repository" detail="Choose a folder once. Cutout stores only an opaque authorization handle." action={<Button size="sm" onClick={() => void chooseRepository()} disabled={loading}>{loading ? <Loader2 className="animate-spin" /> : <GitBranch />}Choose repository</Button>} /> : null}
        {workspace && message ? <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive"><AlertCircle className="mt-0.5 size-3.5 shrink-0" /><span>{message}</span></div> : null}
        {workspace && receipt ? <div role="status" className="mb-3 flex items-start gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2 text-xs text-emerald-700 dark:text-emerald-300"><Check className="mt-0.5 size-3.5 shrink-0" /><span>{receipt}</span></div> : null}
        {workspace && !message && loading && !status ? <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Reading repository…</div> : null}

        {workspace && status && view === 'changes' ? (
          <div className="space-y-3">
            {status.files.length === 0 ? <Empty title="Working tree clean" detail="There are no local changes." icon={<Check className="size-5" />} /> : <>
              <ChangeGroup title="Staged" files={status.files.filter((file) => file.indexStatus !== ' ' && file.indexStatus !== '?')} action="Unstage" busy={busyAction} onAction={(path) => void mutate(`unstage:${path}`, (bridge, handle, snapshot) => bridge.gitUnstage(handle, snapshot.snapshotToken, [path]))} onDiff={(path) => loadDiff(path, 'staged')} />
              <ChangeGroup title="Changes" files={status.files.filter((file) => file.worktreeStatus !== ' ' || file.indexStatus === '?')} action="Stage" busy={busyAction} onAction={(path) => void mutate(`stage:${path}`, (bridge, handle, snapshot) => bridge.gitStage(handle, snapshot.snapshotToken, [path]))} onDiff={(path) => loadDiff(path, 'worktree')} />
              <div className="space-y-2 border-t border-border pt-3">
                <textarea value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} className="min-h-16 w-full resize-none rounded-md border border-border bg-transparent p-2 text-xs outline-none focus:border-foreground/30" placeholder="Commit message" maxLength={500} />
                <Button size="sm" className="w-full" disabled={!commitMessage.trim() || !status.files.some((file) => file.indexStatus !== ' ' && file.indexStatus !== '?') || Boolean(busyAction)} onClick={() => void previewMutation({ kind: 'commit', message: commitMessage.trim() })}>{busyAction === 'mutation-preview' ? <Loader2 className="animate-spin" /> : <Check />}Review commit</Button>
              </div>
            </>}
            {diff ? <div className="rounded-md border border-border"><div className="flex items-center justify-between border-b border-border px-2 py-1.5 text-[11px]"><span className="truncate font-medium">{diff.path}</span><button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setDiff(undefined)}>Close</button></div><pre className="max-h-80 overflow-auto whitespace-pre-wrap p-2 font-mono text-[10px] leading-4 text-muted-foreground">{diff.kind === 'binary' ? 'Binary file. A text diff is unavailable.' : diff.kind === 'unsupported-encoding' ? 'This file encoding cannot be displayed safely.' : diff.patch || 'No textual diff.'}{diff.kind === 'oversized' ? '\n\n[Diff truncated at the display limit]' : ''}</pre></div> : null}
          </div>
        ) : null}

        {workspace && status && view === 'history' ? <div className="space-y-1">{commits.map((commit) => <button type="button" key={commit.oid} className="flex w-full gap-2 rounded-md px-2 py-2 text-left hover:bg-muted" onClick={() => void reviewCommit(commit)}><History className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /><span className="min-w-0"><span className="block truncate text-xs font-medium">{commit.subject}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{commit.shortOid} · {commit.author} · {new Date(commit.authoredAt).toLocaleDateString()}</span></span></button>)}{!historyComplete ? <Button size="sm" variant="ghost" className="w-full" disabled={loading} onClick={() => void loadMoreHistory()}>{loading ? <Loader2 className="animate-spin" /> : <History />}Load older commits</Button> : null}</div> : null}
        {workspace && status && view === 'branches' ? <div className="space-y-2">
          {creatingBranch ? <div className="flex gap-1"><input autoFocus value={branchName} onChange={(event) => setBranchName(event.target.value)} className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 text-xs outline-none" placeholder="feature/name" /><Button size="sm" disabled={!branchName.trim() || Boolean(busyAction)} onClick={() => void previewMutation({ kind: 'create-branch', name: branchName.trim() })}>Review</Button><Button size="sm" variant="ghost" onClick={() => setCreatingBranch(false)}>Cancel</Button></div> : <Button size="sm" variant="outline" className="w-full" onClick={() => setCreatingBranch(true)}><Plus />New branch</Button>}
          {branches.map((branch) => <div key={`${branch.remote}:${branch.name}`} className="flex items-center gap-2 rounded-md px-2 py-2 text-xs hover:bg-muted"><GitBranch className="size-3.5 text-muted-foreground" /><button type="button" className="min-w-0 flex-1 text-left" disabled={branch.current || !status.branch} onClick={() => void compareBranch(branch.name)}><span className="block truncate">{branch.name}{branch.ahead ? ` · ↑${branch.ahead}` : ''}{branch.behind ? ` · ↓${branch.behind}` : ''}</span><span className="block truncate text-[10px] text-muted-foreground">{branch.lastCommitSubject}</span></button>{branch.current ? <span className="text-[10px] text-emerald-500">Current</span> : branch.remote ? <span className="text-[10px] text-muted-foreground">Remote</span> : <Button size="xs" variant="ghost" disabled={Boolean(busyAction)} onClick={() => void previewMutation({ kind: 'switch-branch', name: branch.name })}>Switch</Button>}</div>)}
        </div> : null}
        {workspace && status && view === 'pull-requests' ? <Empty title="Connect GitHub to review pull requests" detail="Local Git is ready. Pull requests require a verified GitHub Host session; Cutout will not infer or simulate remote state." action={<Button size="sm" variant="outline" onClick={() => settings.open({ section: 'integrations', anchor: 'connections' })}>Open Integrations</Button>} /> : null}
      </div>

      <AlertDialog open={Boolean(pushPreview)} onOpenChange={(open) => { if (!open) setPushPreview(undefined) }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Push this branch?</AlertDialogTitle><AlertDialogDescription>{pushPreview ? `${pushPreview.branch} will be pushed to ${pushPreview.remote}.${pushPreview.setUpstream ? ' This remote will become its upstream.' : ''}` : ''}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={busyAction === 'push'} onClick={(event) => { event.preventDefault(); if (!workspace || !pushPreview) return; const plan = pushPreview; void mutate('push', (bridge, handle) => bridge.gitPush(handle, plan.planId)).then(() => setPushPreview(undefined)) }}>{busyAction === 'push' ? 'Pushing…' : 'Push'}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(pendingMutation)} onOpenChange={(open) => { if (!open) setPendingMutation(undefined) }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{pendingMutation?.mutation.kind === 'commit' ? 'Commit staged changes?' : pendingMutation?.mutation.kind === 'create-branch' ? 'Create and switch branch?' : 'Switch branches?'}</AlertDialogTitle><AlertDialogDescription>{pendingMutation?.mutation.kind === 'commit' ? `Create a local commit with message “${pendingMutation.mutation.message}”.` : pendingMutation?.mutation.kind === 'create-branch' ? `Create “${pendingMutation.mutation.name}” from the current HEAD and switch to it.` : pendingMutation?.mutation.kind === 'switch-branch' ? `Switch the working tree to “${pendingMutation.mutation.name}”. Git will stop if local changes conflict.` : ''}{pendingMutation?.warnings.map((warning) => ` ${warning}`).join('')}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={Boolean(busyAction)} onClick={(event) => { event.preventDefault(); void applyPendingMutation() }}>Confirm</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )

  function loadDiff(path: string, target: 'worktree' | 'staged') {
    const bridge = getGitBridge()
    if (!bridge || !workspace) {
      setMessage('Git requires the Cutout desktop host.')
      return
    }
    void bridge.gitDiff(workspace.handle, path, target).then((next) => {
      if (onReview) onReview({ type: 'diff', diff: next })
      else setDiff(next)
    }).catch((error) => setMessage(error instanceof Error ? error.message : 'Unable to read this diff.'))
  }

  async function loadMoreHistory() {
    const bridge = getGitBridge()
    if (!bridge || !workspace || loading) return
    setLoading(true)
    setMessage(undefined)
    try {
      const next = await bridge.gitLog(workspace.handle, 100, commits.length)
      setCommits((current) => [...current, ...next.filter((commit) => !current.some((item) => item.oid === commit.oid))])
      setHistoryComplete(next.length < 100)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load older commits.')
    } finally {
      setLoading(false)
    }
  }

  async function applyPendingMutation() {
    const pending = pendingMutation
    if (!pending || !workspace || !status) return
    const kind = pending.mutation.kind
    await mutate(kind, async (bridge, handle) => (await bridge.gitApplyMutation(handle, pending.planId)).status)
    if (kind === 'commit') setCommitMessage('')
    if (kind === 'create-branch') { setBranchName(''); setCreatingBranch(false) }
    setPendingMutation(undefined)
  }

  async function previewMutation(mutation: GitMutation) {
    const bridge = getGitBridge()
    if (!bridge || !workspace || !status) return
    setBusyAction('mutation-preview')
    setMessage(undefined)
    try { setPendingMutation(await bridge.gitPreviewMutation(workspace.handle, status.snapshotToken, mutation)) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to preview this Git operation.') }
    finally { setBusyAction(undefined) }
  }

  async function reviewCommit(commit: GitCommitSummary) {
    const bridge = getGitBridge()
    if (!bridge || !workspace || !onReview) return
    try {
      const files = await bridge.gitCommitFiles(workspace.handle, commit.oid)
      onReview({ type: 'commit', commit, files, onSelectFile: (path) => void bridge.gitCommitDiff(workspace.handle, commit.oid, path).then((diff) => onReview({ type: 'diff', diff })).catch((error) => setMessage(error instanceof Error ? error.message : 'Unable to read this historical diff.')) })
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to read this commit.') }
  }

  async function compareBranch(compare: string) {
    const bridge = getGitBridge()
    if (!bridge || !workspace || !status?.branch || !onReview) return
    try { onReview({ type: 'branch', comparison: await bridge.gitBranchCompare(workspace.handle, status.branch, compare) }) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to compare these branches.') }
  }
}

function ChangeGroup({ title, files, action, busy, onAction, onDiff }: { readonly title: string; readonly files: GitStatusSnapshot['files']; readonly action: string; readonly busy?: string; readonly onAction: (path: string) => void; readonly onDiff: (path: string) => void }) {
  if (files.length === 0) return null
  return <div><div className="mb-1 px-2 text-[10px] font-medium uppercase text-muted-foreground">{title} · {files.length}</div>{files.map((file) => <div key={`${title}:${file.path}:${file.originalPath ?? ''}`} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"><button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onDiff(file.path)}><span className={cn('flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold', file.conflicted ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground')}>{file.conflicted ? '!' : file.worktreeStatus !== ' ' ? file.worktreeStatus : file.indexStatus}</span><span className="min-w-0 flex-1 truncate text-xs">{file.path}</span><ChevronRight className="size-3.5 text-muted-foreground" /></button><button type="button" className="rounded px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-background hover:text-foreground" disabled={Boolean(busy)} onClick={() => onAction(file.path)}>{busy?.endsWith(file.path) ? 'Working…' : action}</button></div>)}</div>
}

function Empty({ title, detail, icon, action }: { readonly title: string; readonly detail: string; readonly icon?: ReactNode; readonly action?: ReactNode }) {
  return <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-5 text-center">{icon}<div className="text-sm font-medium">{title}</div><p className="max-w-64 text-xs leading-5 text-muted-foreground">{detail}</p>{action ? <div className="mt-2">{action}</div> : null}</div>
}
