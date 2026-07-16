import { describe, expect, it } from 'vitest'
import { createEmptyProjectRecord } from '@/services/local/project-repository.local'
import { bootstrapHomeDraftProject } from './home-draft-bootstrap'

describe('Home draft project bootstrap', () => {
  it('creates one authoritative DesignDocument and durable video capability receipts', async () => {
    const snapshot = await bootstrapHomeDraftProject({
      project: { ...createEmptyProjectRecord(1), id: 'project:home-draft' },
      brief: '  Design a calm commerce homepage  ',
      videos: [{ name: 'reference.mp4', mediaType: 'video/mp4' }],
      now: new Date('2026-07-15T00:00:00.000Z'),
      createId: () => 'video-1',
    })

    expect(snapshot.designDocument).toMatchObject({
      version: 'design-ir.v1',
      meta: { title: expect.any(String) },
    })
    expect(snapshot.capabilityReceipts).toEqual([
      expect.objectContaining({
        id: 'capability:video-1',
        capability: 'video-understanding',
        status: 'required',
        sourceName: 'reference.mp4',
      }),
    ])
  })
})
