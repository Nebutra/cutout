import { describe, expect, it } from 'vitest'
import type {
  PersistedPrototypeDesignSystem,
  PersistedPrototypePage,
} from '@/workspace/workspace-snapshot'
import {
  projectPrototypeArtifacts,
  recoverPrototypeArtifacts,
} from './prototype-artifact-recovery'

const validMarkdown = [
  '---',
  'primary: "#10b981"',
  'radius: 12px',
  '---',
  '# Design system',
].join('\n')

describe('prototype artifact recovery', () => {
  it('keeps recoverable visuals when DESIGN.md needs repair', () => {
    const recovered = recoverPrototypeArtifacts({
      designSystem: designSystem('# Visual direction'),
      pages: [page('home')],
    })

    expect(recovered.designSystem).not.toBeNull()
    expect(recovered.pages).toHaveLength(1)
    expect(recovered.documentation.status).toBe('repair-required')
    expect(recovered.hasValidDesignMarkdown).toBe(false)
    expect(recovered.designSystem?.blob.type).toBe('image/png')
  })

  it('rejects invalid media independently and preserves valid pages', () => {
    const recovered = recoverPrototypeArtifacts({
      designSystem: { ...designSystem(validMarkdown), bytes: new Uint8Array() },
      pages: [page('home'), { ...page('broken'), width: 0 }],
    })

    expect(recovered.designSystem).toBeNull()
    expect(recovered.designSystemMediaError).toContain('no persisted bytes')
    expect(recovered.pages.map((artifact) => artifact.page.id)).toEqual(['home'])
    expect(recovered.rejectedPageIds).toEqual(['broken'])
    expect(recovered.documentation.status).toBe('missing-artifact')
  })

  it('repairs zeroed legacy dimensions from persisted PNG headers', () => {
    const artifact = designSystem(validMarkdown)
    const bytes = new Uint8Array(24)
    bytes.set([0x89, 0x50, 0x4e, 0x47], 0)
    new DataView(bytes.buffer).setUint32(16, 640, false)
    new DataView(bytes.buffer).setUint32(20, 480, false)

    const recovered = recoverPrototypeArtifacts({
      designSystem: { ...artifact, bytes, width: 0, height: 0 },
      pages: [],
    })

    expect(recovered.designSystem).toMatchObject({ width: 640, height: 480 })
    expect(recovered.designSystemMediaError).toBeNull()
  })

  it('derives documentation evidence from the current artifact', () => {
    const recovered = recoverPrototypeArtifacts({
      designSystem: designSystem(validMarkdown),
      pages: [],
    })
    expect(recovered.hasValidDesignMarkdown).toBe(true)

    const repaired = projectPrototypeArtifacts({
      designSystem: recovered.designSystem
        ? { ...recovered.designSystem, designMarkdown: '# Missing tokens' }
        : null,
      pages: recovered.pages,
    })
    expect(repaired.designSystem).not.toBeNull()
    expect(repaired.hasValidDesignMarkdown).toBe(false)
    expect(repaired.documentation.status).toBe('repair-required')
  })
})

function designSystem(
  designMarkdown: string,
): PersistedPrototypeDesignSystem {
  return {
    name: 'Design system',
    designMarkdown,
    bytes: new Uint8Array([137, 80, 78, 71]),
    mediaType: 'image/png',
    width: 1024,
    height: 768,
  }
}

function page(id: string): PersistedPrototypePage {
  return {
    page: {
      id,
      name: id === 'home' ? 'Home' : 'Broken',
      route: `/${id}`,
      purpose: 'Test recovery',
      viewport: {
        platform: 'web',
        width: 1440,
        height: 900,
        scroll: 'single-screen',
      },
      regions: [],
      overlays: [],
      states: [],
      interactions: [],
    },
    bytes: new Uint8Array([137, 80, 78, 71]),
    mediaType: 'image/png',
    width: 1440,
    height: 900,
  }
}
