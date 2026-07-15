import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { setupI18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CollaborationHost } from '@/team-ecosystem'
import { TeamGovernancePanel } from './TeamGovernancePanel'
import { pendingReviewCount } from './collaboration-disclosure'

let root: Root | undefined
let node: HTMLDivElement | undefined
const i18n = setupI18n()
i18n.loadAndActivate({ locale: 'en', messages: { 'team.share_review': 'Share and review', 'team.local_review_description': 'Local review keeps comments, approvals, and read-only shares on this device.', 'team.host_required_description': 'A desktop collaboration host is required to review or create a read-only share.', 'review_branch.section_aria': 'Review branch', 'review_branch.label': 'Review branch', 'review_branch.comment_aria': 'Review comment', 'review_branch.comment_placeholder': 'Add revision-bound comment', 'review_branch.comment_action': 'Comment', 'review_branch.approve_revision': 'Approve revision', 'review_branch.readonly_share': 'Read-only share', 'common.close': 'Close' } })
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
afterEach(() => {
  act(() => root?.unmount())
  node?.remove()
  root = undefined
  node = undefined
})

function mount(host?: CollaborationHost | null, projectId: string | null = 'project.one') {
  node = document.createElement('div')
  document.body.append(node)
  act(() => {
    root = createRoot(node!)
    root.render(<I18nProvider i18n={i18n}><TeamGovernancePanel projectId={projectId} host={host} /></I18nProvider>)
  })
  return node
}

const host = (branch?: unknown): CollaborationHost => ({
  loadBranch: vi.fn(async () => branch),
  saveBranch: vi.fn(async () => undefined),
  createShare: vi.fn(async () => undefined),
})

describe('Library collaboration disclosure', () => {
  it('counts only unresolved review work', () => {
    expect(pendingReviewCount(undefined)).toBe(0)
    expect(pendingReviewCount({ comments: [{}, { resolvedAt: '2026-07-12T00:00:00Z' }], approvals: [{ decision: 'approved' }, { decision: 'changes-requested' }] })).toBe(2)
  })

  it('keeps collaboration collapsed and badge-free without pending work', async () => {
    const view = mount(host())
    await act(async () => {})
    const trigger = view.querySelector('button[aria-haspopup="dialog"]')!
    expect(trigger.getAttribute('aria-label')).toBe('Share and review')
    expect(view.querySelector('[aria-label$="pending reviews"]')).toBeNull()
    expect(document.body.textContent).not.toContain('Current team role')
    expect(document.body.textContent).not.toContain('Remote sync disabled')
  })

  it('opens a mobile-safe local review drawer and surfaces real pending work', async () => {
    const view = mount(host({ comments: [{ body: 'Check contrast' }], approvals: [] }))
    await act(async () => {})
    const trigger = view.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement
    expect(trigger.getAttribute('aria-label')).toContain('1 pending')
    act(() => trigger.click())
    await act(async () => {})
    const dialog = document.body.querySelector('[role="dialog"]')!
    expect(dialog.className).toContain('w-full')
    expect(dialog.textContent).toContain('Local review')
    expect(dialog.textContent).not.toContain('Remote sync disabled')
    expect(dialog.querySelector('[aria-label="Review comment"]')).toBeTruthy()
  })

  it('explains the host requirement without rendering disabled team controls', () => {
    const view = mount(null)
    act(() => (view.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement).click())
    expect(document.body.textContent).toContain('Host required')
    expect(document.body.querySelector('[aria-label="Current team role"]')).toBeNull()
    expect(document.body.querySelector('[aria-label="Review comment"]')).toBeNull()
  })
})
