// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./TopBarActions', () => ({
  TopBarActions: () => createElement('div', { 'data-testid': 'project-actions' }),
}))
vi.mock('./ProjectMenu', () => ({
  ProjectMenu: () => createElement('button', { 'aria-label': 'Project menu' }),
}))
vi.mock('./TabsMenu', () => ({
  TabsMenu: () => createElement('button', { 'aria-label': 'Open tabs' }),
}))

import { TopBar } from './TopBar'

const callbacks = {
  recentlyClosedTabs: [],
  onReopenTab: vi.fn(),
  onOpenHome: vi.fn(),
  onOpenProject: vi.fn(),
  onCloseProject: vi.fn(),
  onNewProject: vi.fn(),
  onRerun: vi.fn(),
  onArchiveProject: vi.fn(),
  onOpenDesignOs: vi.fn(),
}

describe('TopBar global settings entry', () => {
  it.each(['home', 'project'] as const)('no longer renders Settings or theme in the %s view (moved to the home sidebar account menu)', (view) => {
    const html = renderToStaticMarkup(createElement(TopBar, {
      view,
      projectName: 'Untitled project',
      projectTabOpen: true,
      ...callbacks,
    }))

    expect(html).not.toContain('aria-label="Settings"')
    expect(html).not.toContain('Switch to')
  })
})

describe('TopBar project-local actions', () => {
  it('exposes one New task action and dispatches one intent per click', () => {
    const host=document.createElement('div'),onNewProject=vi.fn();document.body.append(host);const root=createRoot(host)
    act(()=>root.render(createElement(TopBar,{view:'home',projectName:'Untitled project',projectTabOpen:false,...callbacks,onNewProject})))
    const button=host.querySelector<HTMLButtonElement>('button[aria-label="New task"]')!
    act(()=>button.click())
    expect(onNewProject).toHaveBeenCalledOnce()
    expect(host.querySelector('button[aria-label="New project"]')).toBeNull()
    act(()=>root.unmount());host.remove()
  })
  it('keeps the design inspector out of global chrome and attaches project actions to the project tab', () => {
    const project = renderToStaticMarkup(createElement(TopBar, {
      view: 'project', projectName: 'Untitled project', projectTabOpen: true, ...callbacks,
    }))
    const home = renderToStaticMarkup(createElement(TopBar, {
      view: 'home', projectName: 'Untitled project', projectTabOpen: true, ...callbacks,
    }))

    expect(project).not.toContain('aria-label="Open Design OS"')
    expect(home).not.toContain('aria-label="Open Design OS"')
    expect(project).toContain('aria-label="Project menu"')
    expect(home).not.toContain('aria-label="Project menu"')
  })
})

describe('TopBar asset library entry', () => {
  it('does not render an isolated asset library button on Home or project chrome', () => {
    for (const view of ['home','project'] as const) {
      const html=renderToStaticMarkup(createElement(TopBar,{view,projectName:'Untitled project',projectTabOpen:true,...callbacks}))
      expect(html).not.toContain('aria-label="Asset library"')
    }
  })
})
