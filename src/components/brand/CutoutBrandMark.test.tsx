import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CutoutBrandMark } from './CutoutBrandMark'

describe('CutoutBrandMark', () => {
  it('uses the governed currentColor derivative and stays decorative by default', () => {
    const html = renderToStaticMarkup(createElement(CutoutBrandMark, { className: 'size-6' }))
    expect(html).toContain('data-cutout-brand="symbol"')
    expect(html).toContain('/brand/symbol-current-color.svg')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('<svg')
  })

  it('supports an accessible approved lockup without reconstructing lettering', () => {
    const html = renderToStaticMarkup(createElement(CutoutBrandMark, { variant: 'horizontal', label: 'Cutout' }))
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="Cutout"')
    expect(html).toContain('/brand/lockup-horizontal-current-color.svg')
  })
})
