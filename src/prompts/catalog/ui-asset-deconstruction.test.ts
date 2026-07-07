import { describe, it, expect } from 'vitest'
import { createBuiltinRegistry } from './index'
import { uiAssetDeconstruction } from './ui-asset-deconstruction'
import { createLocalPromptService } from '@/services/ai/prompt-service.local'
import { render } from '../render'

describe('ui-asset-deconstruction v1.0.0', () => {
  it('carries the expected id, version, scenario and hints', () => {
    expect(uiAssetDeconstruction.id).toBe('ui-asset-deconstruction')
    expect(uiAssetDeconstruction.version).toBe('1.0.0')
    expect(uiAssetDeconstruction.scenario).toBe('ui-deconstruction')
    expect(uiAssetDeconstruction.hints).toEqual({
      modality: 'image-generation',
      kind: 'google',
      temperature: 0.4,
    })
  })

  it('renders the verbatim system instruction (distinctive substrings)', () => {
    const out = render(uiAssetDeconstruction, {})
    // Distinctive verbatim fragments — persona, goal, and a forbidden-behavior.
    expect(out.system).toContain(
      'Senior Visual Asset Deconstruction Artist',
    )
    expect(out.system).toContain('Visual Asset Sheet / Art Decomposition Board')
    expect(out.system).toContain('Do NOT generate a complete UI page')
    expect(out.system).toContain('FLAT, PURE WHITE (#FFFFFF)')
    // v1 has no template variables.
    expect(out.userScaffold).toBeUndefined()
  })

  it('prioritizes hard-to-code visual assets over UI components', () => {
    const out = render(uiAssetDeconstruction, {})

    expect(out.system).toContain(
      'Cutout extracts high-value visual assets, not a UI component library',
    )
    expect(out.system).toContain(
      'Board/cutout is only the route for assets that can be safely arranged',
    )
    expect(out.system).toContain('direct-generate')
    expect(out.system).toContain('board-cutout')
    expect(out.system).toContain('text is NOT a cutout asset by default')
    expect(out.system).toContain('individual letters/characters')
    expect(out.system).toContain('Never split a word or title into separate character slices')
    expect(out.system).toContain(
      'avatar, cover artwork, product artwork, merchandise/object image, standalone artwork, logo-like mark, badge art, marketing banner artwork, hero illustration, premium card/background material layer',
    )
    expect(out.system).toContain(
      'discard cards, inputs, skeleton placeholders, nav bars, tab bars, toolbars, list items, price rows, forms, full panels',
    )
    expect(out.system).toContain(
      'extract and regenerate ONLY that valuable layer: artwork/cover/avatar/badge/icon/product object/background material',
    )
    expect(out.system).toContain(
      'Do NOT extract the entire card, row, panel, or surrounding component frame',
    )
    expect(out.system).toContain(
      'every visually distinct product/object/cover/avatar/badge/sticker should be regenerated as its OWN atomic asset',
    )
    expect(out.system).toContain(
      'if a card or panel contains a genuinely valuable visual material layer',
    )
    expect(out.system).toContain(
      'card radius, avatar circles, star masks, pill clips, device masks',
    )
    expect(out.system).toContain(
      'regenerate the FULL uncropped source image/content as a clean rectangular asset',
    )
    expect(out.system).toContain(
      'atomic does NOT mean splitting every disconnected color island',
    )
    expect(out.system).toContain(
      'keep that designed symbol together as one standalone asset',
    )
    expect(out.system).toContain(
      'complex glassmorphism, neon glow, holographic foil',
    )
    expect(out.system).toContain(
      'wide banner artwork can occupy a dedicated isolated row',
    )
  })

  it('is discoverable through the built-in registry as latest', () => {
    const registry = createBuiltinRegistry()
    expect(registry.resolve('ui-asset-deconstruction').version).toBe('1.0.0')
    const summaries = registry.list()
    expect(summaries.some((s) => s.id === 'ui-asset-deconstruction')).toBe(true)
  })

  it('resolves + renders through the local PromptService', async () => {
    const service = createLocalPromptService()
    const rendered = await service.render({ id: 'ui-asset-deconstruction' })
    expect(rendered.system).toContain('Senior Visual Asset Deconstruction Artist')

    const versions = await service.versions('ui-asset-deconstruction')
    expect(versions).toEqual(['1.0.0'])
  })
})
