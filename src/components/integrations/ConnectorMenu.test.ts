// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { ConnectorMenu } from './ConnectorMenu'
import { connectorCatalog } from './connector-catalog'
let root:ReturnType<typeof createRoot>|undefined; let host:HTMLDivElement|undefined
afterEach(()=>{act(()=>root?.unmount());host?.remove();root=undefined;host=undefined})
describe('Connector menu',()=>{
  it('derives availability from manifests without inventing connected sessions',()=>{expect(connectorCatalog.map((item)=>item.product.name)).toEqual(expect.arrayContaining(['Figma','GitHub','Notion','Obsidian','Pencil','Paper','Framer','Canva','Repository']));expect(connectorCatalog.every((item)=>item.availability!=='available')).toBe(true)})
  it('renders a keyboard-operable trigger',()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root!.render(createElement(ConnectorMenu)));expect(document.querySelector('button[aria-label="Connectors"]')).toBeTruthy()})
  it('uses the shared integration icon registry for all nine connectors',()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root!.render(createElement(ConnectorMenu)));const trigger=document.querySelector('button[aria-label="Connectors"]')!;act(()=>trigger.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,button:0})));const icons=[...document.querySelectorAll('[data-integration-icon]')];expect(icons).toHaveLength(9);expect(icons.map(icon=>icon.getAttribute('data-integration-icon')).sort()).toEqual(connectorCatalog.map(item=>item.id).sort());expect(document.querySelector('[data-brand-fallback]')).toBeNull();expect(icons.every(icon=>!['C','P','R','·'].includes(icon.textContent?.trim()??''))).toBe(true);expect(icons.every(icon=>['Simple Icons','Canva Developers','pen.dev','paper.design','Cutout generic'].includes(icon.getAttribute('data-icon-source')??''))).toBe(true);expect(icons.filter(icon=>icon.getAttribute('data-icon-source')==='Cutout generic')).toHaveLength(1);expect(document.querySelector('[data-integration-icon="cutout.pencil"] img')).toBeTruthy();expect(document.querySelector('[data-integration-icon="cutout.paper"] img')).toBeTruthy();const canva=document.querySelector('[data-integration-icon="cutout.canva"]');expect(canva?.getAttribute('data-icon-source')).toBe('Canva Developers')})
})
