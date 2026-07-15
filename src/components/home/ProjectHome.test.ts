import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LocalProjectSummary } from '@/services/local/project-repository.local'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SettingsUIProvider } from '@/components/settings/settings-ui'
import { setupI18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'

vi.mock('@lingui/react/macro', () => ({
  useLingui: () => ({
    i18n: { locale: 'en-US' },
    t: ({ message }: { message: string }) => message,
  }),
}))

import { ProjectHome, ProjectRow } from './ProjectHome'

const project: LocalProjectSummary = {
  id: 'project:brand-launch',
  name: 'Brand launch',
  brief: 'Initial brief',
  assetCount: 0,
  hasDesignMarkdown: false,
  status: 'Draft',
  createdAt: 1,
  updatedAt: 2,
}
const i18n = setupI18n()
i18n.loadAndActivate({ locale: 'en', messages: {} })
let root:Root|undefined,host:HTMLDivElement|undefined
afterEach(()=>{act(()=>root?.unmount());host?.remove();root=undefined;host=undefined})
function mountHome(onStartWithBrief=vi.fn()){host=document.createElement('div');document.body.append(host);act(()=>{root=createRoot(host!);root.render(createElement(SettingsUIProvider,{value:{open:vi.fn()}},createElement(TooltipProvider,null,createElement(I18nProvider,{i18n},createElement(ProjectHome,{activeProjectId:null,projects:[],loadState:'ready',loadError:null,onOpenProject:vi.fn(),onArchiveProject:vi.fn(),onRestoreProject:vi.fn(),onDeleteProject:vi.fn(),onRenameProject:vi.fn(),onPinProject:vi.fn(),onStartWithBrief,onImportBoard:vi.fn(),onRetryProjects:vi.fn()})))))});return{host,onStartWithBrief}}
const settleFocus=()=>new Promise<void>((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))

describe('ProjectRow', () => {
  it('names the primary action from the project identity rather than its brief', () => {
    const html = renderToStaticMarkup(createElement(
      I18nProvider,
      { i18n },
      createElement(
        TooltipProvider,
        null,
        createElement(ProjectRow, {
          project,
          locale: 'en-US',
          active: false,
          onOpen: vi.fn(),
          onArchive: vi.fn(),
          onRestore: vi.fn(),
          onDelete: vi.fn(),
          onRename: vi.fn(),
          onPin: vi.fn(),
        }),
      ),
    ))

    expect(html).toContain('aria-label="Open Brand launch"')
    expect(html).not.toContain('aria-label="Brand launch Initial brief"')
  })
})

describe('ProjectHome outcome-first start', () => {
  it('resets and refocuses the mounted Home composer when a new-task signal repeats the route',async()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);const render=(signal:number)=>act(()=>root?.render(createElement(SettingsUIProvider,{value:{open:vi.fn()}},createElement(TooltipProvider,null,createElement(I18nProvider,{i18n},createElement(ProjectHome,{resetToStartSignal:signal,activeProjectId:null,projects:[],loadState:'ready',loadError:null,onOpenProject:vi.fn(),onArchiveProject:vi.fn(),onRestoreProject:vi.fn(),onDeleteProject:vi.fn(),onRenameProject:vi.fn(),onPinProject:vi.fn(),onStartWithBrief:vi.fn(),onImportBoard:vi.fn(),onRetryProjects:vi.fn()}))))));render(0);const textarea=host.querySelector('textarea') as HTMLTextAreaElement,web=host.querySelector('button[aria-label="Web"]') as HTMLButtonElement;act(()=>web.click());expect(textarea.value).not.toBe('');render(1);await act(settleFocus);const reset=host.querySelector('textarea') as HTMLTextAreaElement;expect(reset.value).toBe('');expect(host.querySelector('button[aria-label="Web"]')?.getAttribute('aria-pressed')).toBe('false');expect(document.activeElement).toBe(reset)})
  it('keeps presets selection-only and creates exactly once on submit',async()=>{const view=mountHome(),web=view.host.querySelector('button[aria-label="Web"]') as HTMLButtonElement,textarea=view.host.querySelector('textarea') as HTMLTextAreaElement;act(()=>{web.click();web.click();web.click()});await act(settleFocus);expect(document.activeElement).toBe(textarea);expect(view.onStartWithBrief).not.toHaveBeenCalled();expect(textarea.value).toBe('Design a responsive web experience for ');expect(web.getAttribute('aria-pressed')).toBe('true');act(()=>web.click());expect(textarea.value).toBe('');expect(web.getAttribute('aria-pressed')).toBe('false');act(()=>web.click());act(()=>textarea.closest('form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(view.onStartWithBrief).toHaveBeenCalledTimes(1);expect(view.onStartWithBrief).toHaveBeenCalledWith('Design a responsive web experience for',[])})
  it('renders one primary outcome composer with attachment and submit only', () => {
    const html = renderToStaticMarkup(createElement(
      SettingsUIProvider,
      { value: { open: vi.fn() } },
      createElement(
        TooltipProvider,
        null,
        createElement(I18nProvider, { i18n }, createElement(ProjectHome, {
        activeProjectId: null,
        projects: [],
        loadState: 'ready',
        loadError: null,
        onOpenProject: vi.fn(),
        onArchiveProject: vi.fn(),
        onRestoreProject: vi.fn(),
        onDeleteProject: vi.fn(),
        onRenameProject: vi.fn(),
        onPinProject: vi.fn(),
        onStartWithBrief: vi.fn(),
        onImportBoard: vi.fn(),
        onRetryProjects: vi.fn(),
        })),
      ),
    ))

    expect(html.match(/<textarea/g)).toHaveLength(1)
    expect(html).toContain('Describe the result you want')
    expect(html).toContain('aria-label="Attach a reference"')
    expect(html).toContain('data-testid="home-composer-actions"')
    expect(html).toContain('data-testid="home-composer-surface"')
    const surfaceStart=html.indexOf('data-testid="home-composer-surface"'),actionsStart=html.indexOf('data-testid="home-composer-actions"'),surfaceEnd=html.indexOf('</form>')
    expect(surfaceStart).toBeGreaterThan(-1)
    expect(actionsStart).toBeGreaterThan(surfaceStart)
    expect(actionsStart).toBeLessThan(surfaceEnd)
    expect(html).toContain('focus-within:border-foreground/30')
    expect(html).not.toContain('border-t border-border/70')
    expect(html).not.toContain('bg-muted/20')
    expect(html).toContain('px-3 pt-1 pb-3')
    expect(html).toContain('resize-none rounded-none border-0 bg-transparent')
    expect(html).toContain('aria-label="Create from brief"')
    expect(html).toContain('disabled=""')
    expect(html).not.toContain('Open a blank project')
    expect(html).not.toContain('Start with a brief</span>')
    expect(html).not.toContain('Import a visual board</span>')
  })
})
