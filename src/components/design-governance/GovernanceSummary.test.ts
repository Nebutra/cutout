import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { GovernanceSummary } from './GovernanceSummary'
import type { GovernanceReceipt, GovernanceScenario } from '@/design-governance'

const scenario={id:'usage',scenarioId:'usage:dark:focus',selector:'#save',foregroundTokenId:'brand',backgroundTokenId:'surface',kind:'focus-indicator',mode:'dark',state:'focus',componentId:'button',lockedTokenIds:['brand']} satisfies GovernanceScenario
const receipt={version:'cutout.design-governance-receipt.v1',receiptId:'g:1',createdAt:1,status:'blocked',evidenceHash:'a'.repeat(64),findings:[{id:'f:1',scenarioId:scenario.scenarioId,rule:'focus-visible',severity:'hard',status:'failed',summary:'Focus is not visible.',evidence:{ratio:2.1,standard:'WCAG 2.2'}}]} satisfies GovernanceReceipt
describe('GovernanceSummary',()=>{it('shows blockers without a misleading score and requests scoped approved repair',()=>{const host=document.createElement('div'),root=createRoot(host),repair=vi.fn();act(()=>root.render(createElement(GovernanceSummary,{receipt,scenarios:[scenario],onRequestRepair:repair})));expect(host.textContent).toContain('1 blockers');expect(host.textContent).toContain('dark · focus');expect(host.textContent).not.toMatch(/score|\/100/i);const button=host.querySelector('button');act(()=>button?.click());expect(repair).toHaveBeenCalledWith({receiptId:'g:1',failedFindingIds:['f:1'],requiresApproval:true});act(()=>root.unmount())})})
