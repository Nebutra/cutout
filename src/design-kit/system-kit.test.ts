import { describe, expect, it } from 'vitest'
import {
  designSystemArtifacts,
  planDesignSystemKit,
  validateDesignSystemCatalog,
  type DesignSystemArtifact,
} from './system-kit'

describe('Design System Kit material catalog', () => {
  it('covers the complete product design-system lifecycle with executable gates', () => {
    expect(() => validateDesignSystemCatalog(designSystemArtifacts)).not.toThrow()
    expect(new Set(designSystemArtifacts.map((artifact) => artifact.stage))).toEqual(new Set([
      'foundation', 'semantic', 'primitive', 'component', 'pattern', 'template',
      'binding', 'documentation', 'quality', 'package',
    ]))
    expect(designSystemArtifacts.filter((artifact) => artifact.stage === 'foundation').map((artifact) => artifact.id)).toEqual([
      'ds.foundation.color', 'ds.foundation.typography', 'ds.foundation.spacing',
      'ds.foundation.grid', 'ds.foundation.radius', 'ds.foundation.elevation',
      'ds.foundation.motion', 'ds.foundation.iconography', 'ds.foundation.imagery',
      'ds.foundation.accessibility', 'ds.foundation.content',
    ])
    expect(designSystemArtifacts.find((artifact) => artifact.id === 'ds.binding.web')?.outputs).toEqual(expect.arrayContaining([
      'tokens/tokens.json', 'tokens/tokens.css', 'tokens/tailwind.css', 'tokens/theme.ts',
    ]))
    expect(designSystemArtifacts.find((artifact) => artifact.id === 'ds.binding.figma')?.description).toContain('not live sync')
    expect(designSystemArtifacts.find((artifact) => artifact.id === 'ds.binding.figma')?.executors).toContain('figma-adapter')
    expect(designSystemArtifacts.find((artifact) => artifact.id === 'ds.binding.astryx')).toMatchObject({
      stage: 'binding', executors: ['compiler'], gates: expect.arrayContaining(['package-consumer', 'provenance']),
    })
    expect(designSystemArtifacts.find((artifact) => artifact.id === 'ds.template.library')?.executors).toEqual([
      'compiler', 'coding-agent', 'visual-generation',
    ])
    expect(designSystemArtifacts.every((artifact) => artifact.executors.length > 0)).toBe(true)
    expect(designSystemArtifacts.find((artifact) => artifact.id === 'ds.quality.suite')?.gates).toEqual(expect.arrayContaining([
      'contrast', 'keyboard', 'screen-reader', 'visual-regression', 'code-connect', 'package-consumer',
    ]))
  })

  it('builds a deterministic complete profile DAG with every dependency before its consumer', () => {
    const first = planDesignSystemKit({ profile: 'complete' })
    const second = planDesignSystemKit({ profile: 'complete' })
    expect(second).toEqual(first)
    expect(first.nodes).toHaveLength(designSystemArtifacts.length)
    const positions = new Map(first.order.map((id, index) => [id, index]))
    for (const node of first.nodes) {
      for (const dependency of node.dependsOn) {
        expect(positions.get(dependency.replace('build:', ''))).toBeLessThan(positions.get(node.artifactId) as number)
      }
    }
    expect(first.order.at(-1)).toBe('ds.package.release')
  })

  it('supports profiles without breaking transitive dependencies', () => {
    const foundation = planDesignSystemKit({ profile: 'foundation' })
    const product = planDesignSystemKit({ profile: 'product' })
    expect(foundation.order).not.toContain('ds.component.library')
    expect(foundation.order).not.toContain('ds.template.library')
    expect(product.order).toContain('ds.component.library')
    expect(product.order).not.toContain('ds.template.library')
    expect(product.order).not.toContain('ds.package.release')
  })

  it('rebuilds only the changed foundation and its downstream consumers', () => {
    const plan = planDesignSystemKit({ profile: 'complete', changedKeys: ['tokens.motion'] })
    expect(plan.fullBuild).toBe(false)
    expect(plan.order).toContain('ds.foundation.motion')
    expect(plan.order).toContain('ds.semantic.themes')
    expect(plan.order).toContain('ds.package.release')
    expect(plan.order).not.toContain('ds.foundation.grid')
    expect(plan.order).not.toContain('ds.foundation.imagery')
    expect(plan.nodes.find((node) => node.artifactId === 'ds.foundation.motion')?.reason).toBe('changed')
  })

  it('keeps image generation constrained to imagery-bearing artifacts', () => {
    const generated = designSystemArtifacts.filter((artifact) => artifact.modes.includes('image-generation'))
    expect(generated.map((artifact) => artifact.id)).toEqual([
      'ds.foundation.imagery',
      'ds.template.library',
    ])
    expect(designSystemArtifacts.find((artifact) => artifact.id === 'ds.binding.web')?.modes).toEqual(['deterministic'])
    expect(designSystemArtifacts.find((artifact) => artifact.id === 'ds.package.release')?.modes).toEqual(['deterministic'])
  })

  it('rejects duplicate output ownership, missing dependencies and dependency cycles', () => {
    const base = designSystemArtifacts[0] as DesignSystemArtifact
    expect(() => validateDesignSystemCatalog([base, { ...base, id: 'ds.foundation.copy' }])).toThrow('owned by both')
    expect(() => validateDesignSystemCatalog([{ ...base, dependsOn: ['ds.missing'] }])).toThrow('unknown artifact')
    const left = { ...base, id: 'ds.foundation.left', outputs: ['left'], dependsOn: ['ds.foundation.right'] }
    const right = { ...base, id: 'ds.foundation.right', outputs: ['right'], dependsOn: ['ds.foundation.left'] }
    expect(() => validateDesignSystemCatalog([left, right])).toThrow('cycle')
  })
})
