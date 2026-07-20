import { describe, expect, it } from 'vitest'
import { emptyAssetProductionSnapshot } from '../contracts'
import { publishToolCutoutProduction } from './tool-cutout'

describe('tool cutout production adapter', () => {
  it('publishes every output through stable import-cutout tasks', async () => {
    const snapshot = await publishToolCutoutProduction({
      snapshot: emptyAssetProductionSnapshot(),
      projectRevisionId: 'revision:4',
      sourceArtifactId: `artifact:sha256:${'a'.repeat(64)}`,
      sourceSha256: 'a'.repeat(64),
      toolCallId: 'cutout:1',
      runId: 'asset-production:tool:1',
      cutoutParams: { threshold: 246, minArea: 900, mergeGap: 18, padding: 10 },
      outputs: [
        {
          sliceId: 'slice-1',
          box: { x: 0, y: 0, width: 10, height: 10 },
          artifact: {
            artifactId: `artifact:sha256:${'b'.repeat(64)}`,
            sha256: 'b'.repeat(64),
            mediaType: 'image/png',
            width: 10,
            height: 10,
          },
        },
      ],
      createdAt: 1,
    })
    const run = snapshot.runs['asset-production:tool:1']
    expect(run?.status).toBe('completed')
    expect(Object.values(run?.tasks ?? {})).toEqual([
      expect.objectContaining({
        status: 'ready',
        origin: 'native',
        evidence: {
          sourceArtifactId: `artifact:sha256:${'a'.repeat(64)}`,
          bounds: { x: 0, y: 0, width: 10, height: 10 },
          cutoutParams: { threshold: 246, minArea: 900, mergeGap: 18, padding: 10 },
          providerRoute: 'local/cutout-v1',
        },
      }),
    ])
    expect(snapshot.plans[run!.planId]?.tasks[0]).toMatchObject({
      manifestItemId: 'tool:cutout:1:slice-1',
      route: 'import-cutout',
    })
  })
})
