import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { connectorCatalog } from '@/components/integrations/connector-catalog'
import { integrationIconRegistry } from './integration-icon-registry'
import { IntegrationIcon } from './integration-icons'

describe('IntegrationIcon', () => {
  it('renders theme-adaptive local Simple Icons with accessible names', () => {
    for (const [id, name] of [
      ['cutout.figma', 'Figma'],
      ['cutout.github', 'GitHub'],
      ['cutout.notion', 'Notion'],
      ['cutout.obsidian', 'Obsidian'],
      ['cutout.framer', 'Framer'],
    ] as const) {
      const html = renderToStaticMarkup(
        createElement(IntegrationIcon, { id, name }),
      )
      expect(html).toContain(`aria-label="${name} logo"`)
      expect(html).toContain('data-icon-source="Simple Icons"')
      expect(html).toContain('data-icon-kind="monochrome-svg"')
      expect(html).toContain('fill-current')
      expect(html).toContain('size-5')
      expect(html).not.toContain('https://')
    }
  })

  it('preserves the official Canva gradient wordmark', () => {
    const asset = integrationIconRegistry['cutout.canva']
    expect(asset).toMatchObject({
      kind: 'color-svg',
      source: 'Canva Developers',
      sourceUrl: 'https://www.canva.dev/',
      license: 'Canva trademark and brand terms',
    })
    expect(asset.svg).toContain('<title>Canva</title>')
    expect(asset.svg).toMatch(/viewBox="0 0 80 30"/)
    expect(asset.svg).toContain('url(#canva-a)')
    const html = renderToStaticMarkup(
      createElement(IntegrationIcon, { id: 'cutout.canva', name: 'Canva' }),
    )
    expect(html).toContain('aria-label="Canva logo"')
    expect(html).toContain('data-icon-kind="color-svg"')
    expect(html).not.toContain('fill-current')
  })

  it('renders official locally bundled Pencil and Paper artwork', () => {
    for (const [id, name, source, sourceUrl] of [
      [
        'cutout.pencil',
        'Pencil',
        'pen.dev',
        'https://pen.dev/apple-touch-icon.png',
      ],
      [
        'cutout.paper',
        'Paper',
        'paper.design',
        'https://paper.design/logos/app-icons/Paper%20App%20Icon%20512.png',
      ],
    ] as const) {
      const asset = integrationIconRegistry[id]
      expect(asset).toMatchObject({ kind: 'image', source, sourceUrl })
      expect(asset.src).toMatch(/\.png$/)
      const html = renderToStaticMarkup(
        createElement(IntegrationIcon, { id, name }),
      )
      expect(html).toContain(`aria-label="${name} logo"`)
      expect(html).toContain(`data-icon-source="${source}"`)
      expect(html).toContain('data-icon-kind="image"')
      expect(html).toContain('<img')
      expect(html).not.toContain(`${name} integration`)
    }
  })

  it('keeps Repository as the only generic connector mark', () => {
    for (const connector of connectorCatalog) {
      const html = renderToStaticMarkup(
        createElement(IntegrationIcon, {
          id: connector.id,
          name: connector.product.name,
        }),
      )
      expect(html).toContain(`data-integration-icon="${connector.id}"`)
      if (connector.id === 'cutout.repository') {
        expect(html).toContain('data-icon-source="Cutout generic"')
        expect(html).toContain('aria-label="Repository integration"')
      } else {
        expect(html).not.toContain('data-icon-source="Cutout generic"')
      }
    }
  })

  it('records source and license for every bundled brand', () => {
    for (const value of Object.values(integrationIconRegistry)) {
      expect(value.sourceUrl).toMatch(/^https:\/\//)
      expect(value.license).toBeTruthy()
    }
  })

  it('falls back safely for an unknown connector id', () => {
    const html = renderToStaticMarkup(
      createElement(IntegrationIcon, { id: 'cutout.future', name: 'Future' }),
    )
    expect(html).toContain('aria-label="Future integration"')
    expect(html).toContain('data-icon-kind="generic"')
  })
})
