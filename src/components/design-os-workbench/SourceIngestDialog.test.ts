// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setupI18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { SourceIngestDialog } from './SourceIngestDialog'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let container: HTMLDivElement | undefined
let root: ReturnType<typeof createRoot> | undefined
afterEach(() => { if (root) act(() => root?.unmount()); container?.remove(); root=undefined; container=undefined })
const i18n=setupI18n(); i18n.loadAndActivate({ locale:'en', messages:{ 'common.close':'Close' } })
function mount(props: Parameters<typeof SourceIngestDialog>[0]) { container=document.createElement('div'); document.body.append(container); root=createRoot(container); act(() => root?.render(createElement(I18nProvider, { i18n }, createElement(SourceIngestDialog, props)))); return document.body }

describe('SourceIngestDialog repository path', () => {
  it('offers one unified source menu and keeps videos visibly adapter-required', () => {
    const view=mount({ open:true, onOpenChange:vi.fn(), onPrepare:vi.fn(), onPrepareBatch:vi.fn() })
    expect(view.textContent).toContain('Add sources')
    expect(view.querySelector('[aria-label="Paste text or URL"]')).toBeTruthy()
    expect(view.textContent).not.toContain('IdeaStoryNeed')
    const input=view.querySelector('input[aria-label="Add local files"]') as HTMLInputElement
    const video=new File([new Uint8Array([1])], 'walkthrough.mp4', { type:'video/mp4' })
    Object.defineProperty(input, 'files', { configurable:true, value:[video] })
    act(() => input.dispatchEvent(new Event('change', { bubbles:true })))
    expect(view.textContent).toContain('Adapter required')
    expect(view.textContent).toContain('does not process or upload them')
  })
  it('keeps repository inventory in Connectors rather than the source dialog', () => {
    const view=mount({ open:true, onOpenChange:vi.fn(), onPrepare:vi.fn() })
    expect(view.textContent).not.toContain('Select local repository')
    expect(view.querySelector('input[aria-label="Repository inventory JSON"]')).toBeNull()
  })

})
