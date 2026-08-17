import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/workspace/IntentWorkspace', () => ({
  IntentWorkspace: (props: { initialProfileLaunch?: { kind: string } }) => createElement('div', {
    'data-intent-workspace': true,
    'data-profile-launch': props.initialProfileLaunch?.kind,
  }),
}))

import { PipelineCanvas } from './PipelineCanvas'

describe('PipelineCanvas layout contract', () => {
  it('renders a full-size non-overflowing shell', () => {
    const html = renderToStaticMarkup(createElement(PipelineCanvas, { onOpenDesignOs: vi.fn() }))
    expect(html).toContain('data-intent-workspace="true"')
    expect(html).toContain('min-h-0')
    expect(html).toContain('min-w-0')
    expect(html).toContain('overflow-hidden')
  })

  it('forwards a project-bound Profile launch into the mounted workspace', () => {
    const html = renderToStaticMarkup(createElement(PipelineCanvas, {
      onOpenDesignOs: vi.fn(),
      initialProfileLaunch: { kind: 'commerce', sourceText: 'localized material set' },
    }))
    expect(html).toContain('data-profile-launch="commerce"')
  })
})
