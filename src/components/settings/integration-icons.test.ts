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

  it('renders the locally bundled Iconify Boxicons Brands Canva mark', () => {
    const asset = integrationIconRegistry['cutout.canva']
    expect(asset).toMatchObject({
      kind: 'monochrome-svg',
      source: 'Iconify (Boxicons Brands)',
      sourceUrl: 'https://api.iconify.design/bxl:canva.svg',
      license: 'MIT',
    })
    expect(asset.svg).toMatch(/viewBox="0 0 24 24"/)
    expect(asset.svg).toContain('fill="currentColor"')
    const html = renderToStaticMarkup(
      createElement(IntegrationIcon, { id: 'cutout.canva', name: 'Canva' }),
    )
    expect(html).toContain('aria-label="Canva logo"')
    expect(html).toContain('data-icon-kind="monochrome-svg"')
    expect(html).toContain('fill-current')
  })

  it('uses typed default and compact icon boxes', () => {
    const defaultHtml = renderToStaticMarkup(
      createElement(IntegrationIcon, { id: 'cutout.figma', name: 'Figma' }),
    )
    const compactHtml = renderToStaticMarkup(
      createElement(IntegrationIcon, {
        id: 'cutout.figma',
        name: 'Figma',
        size: 'compact',
      }),
    )
    expect(defaultHtml).toContain('data-icon-size="default"')
    expect(defaultHtml).toContain('size-5')
    expect(compactHtml).toContain('data-icon-size="compact"')
    expect(compactHtml).toContain('size-4')
  })

  it('vertically centers SVG, image, and generic icon boxes consistently', () => {
    for (const [id, name] of [
      ['cutout.figma', 'Figma'],
      ['cutout.pencil', 'Pencil'],
      ['cutout.repository', 'Repository'],
    ] as const) {
      const html = renderToStaticMarkup(
        createElement(IntegrationIcon, { id, name, size: 'compact' }),
      )
      expect(html).toContain(
        'class="inline-flex shrink-0 self-center align-middle items-center justify-center size-4',
      )
    }
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
    expect(html).toContain('<span role="img"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('focusable="false"')
  })
})
