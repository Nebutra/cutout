import { describe, expect, it, vi } from 'vitest'
import { IntegrationRegistry } from './registry'
import { createGitHubIntegration, type GitHubIntegrationHost } from './github'

const repository = { installationId: 'installation:1', owner: 'cutout', repo: 'app', defaultBranch: 'main', headSha: 'abc123' }
function host(): GitHubIntegrationHost {
  return {
    repository: vi.fn(async () => ({ ok: true as const, value: repository })),
    inventory: vi.fn(async () => ({ ok: true as const, value: [{ path: 'src/App.tsx', sha: 'file123', bytes: 100, mediaType: 'text/typescript' }] })),
    feedback: vi.fn(async () => ({ ok: true as const, value: [{ kind: 'issue' as const, number: 7, title: 'Improve hero', body: 'Increase contrast', updatedAt: '2026-07-12T00:00:00Z', url: 'https://github.com/cutout/app/issues/7' }] })),
    apply: vi.fn(async () => ({ ok: true as const, value: { branch: 'cutout/revision-1', commitSha: 'commit123', pullRequestUrl: 'https://github.com/cutout/app/pull/1', checkUrls: [] } })),
    verifyWebhook: vi.fn(async ({ signature }) => signature === 'sha256=verified'),
  }
}
const request = (operation: 'preview' | 'import' | 'publish') => ({ operation, session: { id: 'session', integrationId: 'cutout.github', surface: 'headless' as const, authMode: 'host-session' as const, secretHandle: { kind: 'secret-handle' as const, id: 'github-installation-token' }, createdAt: '2026-07-12T00:00:00Z' }, base: { documentId: 'design', revisionId: 'revision:1', revisionNumber: 1 }, current: { documentId: 'design', revisionId: 'revision:1', revisionNumber: 1 }, locator: 'cutout/app', title: 'Design delivery' })

describe('GitHub P1 integration', () => {
  it('negotiates selected-repository preview and imports issue feedback with provenance', async () => {
    const github = createGitHubIntegration(host()), registry = new IntegrationRegistry()
    expect(registry.register(github).ok).toBe(true)
    expect(registry.negotiate({ operation: 'preview', domain: 'repositories', surface: 'headless' })).toHaveLength(1)
    const preview = await registry.run('cutout.github', request('preview'))
    expect(preview).toMatchObject({ ok: true, data: { resources: [{ title: 'src/App.tsx', revision: 'file123', metadata: { path: 'src/App.tsx' } }] } })
    expect(JSON.stringify(preview)).not.toContain('github-installation-token')
    const imported = await registry.run('cutout.github', request('import'))
    expect(imported).toMatchObject({ ok: true, data: { sourcePatch: { sources: [{ title: 'Improve hero', role: 'requirement' }], provenance: [{ actor: { id: 'cutout.github' } }] } } })
  })

  it('previews branch/commit/PR/check writes and requires approval without default branch or merge', async () => {
    const fake = host(), github = createGitHubIntegration(fake)
    const plan = await github.createWritePlan(request('publish'), [{ path: 'src/App.tsx', contentSha256: 'a'.repeat(64), diff: '@@ verified diff @@' }], [{ name: 'Cutout visual QA', summary: 'Passed' }])
    expect(plan).toMatchObject({ ok: true, data: { repository: { owner: 'cutout', repo: 'app' }, branch: 'cutout/revision-1', baseSha: 'abc123', files: [{ path: 'src/App.tsx' }], pullRequest: { base: 'main', head: 'cutout/revision-1' }, checks: [{ name: 'Cutout visual QA' }], approvalRequired: true, merge: false } })
    if (!plan.ok) throw new Error('expected plan')
    expect(await github.applyApprovedPublish(request('publish'), plan.data, '')).toMatchObject({ ok: false, error: { code: 'authorization-required' } })
    expect(fake.apply).not.toHaveBeenCalled()
    expect(await github.applyApprovedPublish(request('publish'), { ...plan.data, branch: 'main' }, 'approved')).toMatchObject({ ok: false, error: { code: 'conflict' } })
    expect(await github.applyApprovedPublish(request('publish'), plan.data, 'approved')).toMatchObject({ ok: true, data: { commitSha: 'commit123' } })
    expect(fake.apply).toHaveBeenCalledOnce()
  })

  it('verifies and deduplicates webhooks and returns structured rate limits', async () => {
    const fake = host(), github = createGitHubIntegration(fake)
    expect(await github.receiveWebhook({ signature: 'bad', deliveryId: 'delivery-1', body: new Uint8Array(), receivedAt: '2026-07-12T00:00:00Z' })).toMatchObject({ ok: false, error: { code: 'authorization-required' } })
    expect(await github.receiveWebhook({ signature: 'sha256=verified', deliveryId: 'delivery-1', body: new Uint8Array(), receivedAt: '2026-07-12T00:00:00Z' })).toEqual({ ok: true, data: { duplicate: false, deliveryId: 'delivery-1' } })
    expect(await github.receiveWebhook({ signature: 'anything', deliveryId: 'delivery-1', body: new Uint8Array(), receivedAt: '2026-07-12T00:00:01Z' })).toEqual({ ok: true, data: { duplicate: true, deliveryId: 'delivery-1' } })
    fake.repository = vi.fn(async () => ({ ok: false as const, limit: { kind: 'secondary' as const, retryAfterSeconds: 60 } }))
    const limited = await github.createWritePlan(request('publish'), [], [])
    expect(limited).toMatchObject({ ok: false, error: { code: 'integration-failed', message: expect.stringContaining('secondary') } })
  })
})
