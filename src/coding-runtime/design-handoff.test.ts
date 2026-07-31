import { describe, expect, it, vi } from 'vitest'
import { prepareDesignCodingHandoff } from './design-handoff'
import type { NativeCodingWorkspaceBridge } from './native-workspace'

describe('Design Coding handoff', () => {
  it('seeds content-addressed assets and previews one multimodal route patch', async () => {
    const seed = vi.fn(async (_handle: string, assets: readonly {
      id: string; bytes: Uint8Array; sha256: string
    }[]) => assets.map((asset) => ({
      id: asset.id,
      path: `site/assets/${asset.sha256}.png`,
      sha256: asset.sha256,
      byteLength: asset.bytes.byteLength,
    })))
    const workspace: NativeCodingWorkspaceBridge = {
      snapshot: vi.fn(async () => ({ snapshotId: 'sha256:empty' })),
      readAllowed: vi.fn(async () => ({})),
      preview: vi.fn(async (_handle, _task, patch) => patch.files.map((file: {
        path: string; operation: 'create' | 'replace' | 'delete'
      }) => ({
        path: file.path,
        operation: file.operation,
      }))),
      stage: vi.fn(),
      runChecks: vi.fn(),
      promote: vi.fn(),
      rollback: vi.fn(),
    }
    const generateObject = vi.fn(async (_request, schema) => ({
      ok: true as const,
      data: schema.parse({
        files: [{ path: 'site/pages/index.html', operation: 'create', contents: '<main>Trips</main>' }],
        rationale: 'Used the selected route and seeded art.',
      }),
    }))
    const result = await prepareDesignCodingHandoff({
      generation: { generateObject },
      assignment: { providerId: 'verified', model: 'coding-model' },
      managedBridge: {
        create: async () => ({ handle: 'workspace.managed', label: 'Managed coding workspace' }),
        seed,
      },
      workspaceBridge: workspace,
      brief: 'A quiet travel planner.',
      designDocumentRef: 'design-ir:revision.4',
      designDocumentJson: '{"revision":4}',
      designMarkdown: '# Travel system',
      routeGraphJson: '{"routes":["/","/trips"]}',
      routeIds: ['/', '/trips'],
      candidateId: 'candidate:quiet',
      assets: [{
        id: 'page:home', label: 'Home', kind: 'prototype-page',
        mediaType: 'image/png', bytes: new Uint8Array([1, 2, 3]), pageId: 'home',
      }],
      expectedRevision: 4,
    })

    expect(result.prepared.receipt.status).toBe('previewed')
    expect(seed).toHaveBeenCalledWith('workspace.managed', [expect.objectContaining({
      id: 'page:home', sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    })])
    expect(workspace.snapshot).toHaveBeenCalledWith(
      'workspace.managed',
      ['site/pages', 'site/styles'],
    )
    expect(generateObject).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'verified',
      input: [
        expect.objectContaining({ type: 'text', text: expect.stringContaining('site/assets/') }),
        { type: 'image', image: new Uint8Array([1, 2, 3]) },
      ],
    }), expect.anything())
  })
})
