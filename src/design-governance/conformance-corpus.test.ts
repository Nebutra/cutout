import { describe, expect, it, vi } from 'vitest'
import { sha256 } from 'js-sha256'
import { createGovernanceRepairTask, enumerateGovernanceScenarios, evaluateGovernance, rerunGovernanceRepair } from './governance'
import { contrastRatio as cssContrast, normalizeSrgb, parseCssColor } from './color'
import { runDesignGovernance, type StandardGovernancePolicy } from './harness'
import type { ComputedStyleFact } from './contracts'

const modes = ['light', 'dark', 'high-contrast'] as const
const states = ['default', 'hover', 'focus', 'disabled', 'selected'] as const
const policy: StandardGovernancePolicy = { version:'design-governance-policy.v1', id:'policy.conformance', standards:{wcag:'2.2',dtcg:'2025.10',cssColor:'4'}, severity:{}, thresholds:{perceptualDeltaE:5,spacingBase:4,maxMotionMs:500,minFocusArea:4} }
const location = { entityId:'component.button', path:'components/button' }
const binding = (kind:'text'|'ui-boundary'|'focus-indicator'|'color-only', lockedTokenIds:string[] = []) => ({ id:`binding.${kind}`, selector:'#subject', foregroundTokenId:'fg', backgroundTokenId:'bg', kind, modes, states, lockedTokenIds })
const scenario = (kind:Parameters<typeof binding>[0], locked=false) => enumerateGovernanceScenarios([binding(kind, locked?['fg']:[])],new Set(['fg','bg']))[0]!
const fact = (scenarioId:string, overrides:Partial<ComputedStyleFact>={}):ComputedStyleFact => ({ scenarioId,viewport:'desktop',foreground:'rgb(0,0,0)',backgroundLayers:['rgb(255,255,255)'],fontSizePx:16,fontWeight:400,outlineWidthPx:2,nonColorCue:true,axeViolations:[],...overrides })

describe('Design Governance strict conformance corpus', () => {
  it('enumerates every light/dark/high-contrast and interaction-state cell exactly once', () => {
    const values=enumerateGovernanceScenarios([binding('text')],new Set(['fg','bg']))
    expect(values).toHaveLength(15)
    expect(new Set(values.map(({scenarioId})=>scenarioId)).size).toBe(15)
    expect(values.map(({mode,state})=>`${mode}:${state}`).sort()).toEqual(modes.flatMap((mode)=>states.map((state)=>`${mode}:${state}`)).sort())
  })

  it('calibrates WCAG 2.2 normal, large, non-text, focus and color-only hard gates', () => {
    const normal=scenario('text'), large=scenario('text'), boundary=scenario('ui-boundary'), focus=scenario('focus-indicator'), color=scenario('color-only')
    expect(evaluateGovernance([normal],[fact(normal.scenarioId,{foreground:'rgb(119,119,119)'})],1).status).toBe('blocked')
    expect(evaluateGovernance([large],[fact(large.scenarioId,{foreground:'rgb(119,119,119)',fontSizePx:24})],1).status).toBe('passed')
    expect(evaluateGovernance([boundary],[fact(boundary.scenarioId,{borderColor:'rgb(160,160,160)'})],1).status).toBe('blocked')
    expect(evaluateGovernance([focus],[fact(focus.scenarioId,{outlineColor:'rgb(0,0,0)',outlineWidthPx:1.99})],1).status).toBe('blocked')
    expect(evaluateGovernance([color],[fact(color.scenarioId,{nonColorCue:false})],1).findings[0]).toMatchObject({rule:'color-only',severity:'hard',status:'failed'})
  })

  it('composites alpha correctly and keeps CSS Color 4 gamut mapping finite', () => {
    const subject=scenario('text')
    const opaque=evaluateGovernance([subject],[fact(subject.scenarioId)],1).findings[0]!.evidence.ratio as number
    const translucent=evaluateGovernance([subject],[fact(subject.scenarioId,{foreground:'rgba(0,0,0,0.5)'})],1).findings[0]!.evidence.ratio as number
    expect(opaque).toBeCloseTo(21,5); expect(translucent).toBeGreaterThan(3); expect(translucent).toBeLessThan(opaque)
    for(const value of ['oklch(62.8% 0.258 29.23)','oklch(70% 0.5 140)','color(display-p3 1 0 0)','color(display-p3 0 1 0 / 50%)']){
      const parsed=parseCssColor(value),normalized=normalizeSrgb(parsed)
      expect(normalized).toMatch(/^rgb\(/); expect(cssContrast(parsed,parseCssColor('#fff'))).toBeGreaterThanOrEqual(1)
    }
  })

  it('keeps hard failures and color-vision/aesthetic advisories semantically separate', () => {
    const report=runDesignGovernance({documentId:'doc',revisionId:'rev',tokens:[],samples:[
      {kind:'color-only',id:'status',colors:['#ff0000','#00ff00'],hasSecondaryCue:false,location},
      {kind:'harmony',id:'harmony',score:.2,rationale:'Human review.',location},
    ],completedAt:'2026-07-12T00:00:00.000Z'},policy)
    expect(report.findings.find(({ruleId})=>ruleId==='wcag.color-only')).toMatchObject({severity:'error',blocking:true})
    expect(report.findings.filter(({severity})=>severity==='advisory').every(({blocking})=>!blocking)).toBe(true)
  })

  it('covers reduced-motion hard behavior and long-duration advisory behavior independently', () => {
    const hard=runDesignGovernance({documentId:'doc',revisionId:'motion-hard',tokens:[],samples:[{kind:'motion',id:'motion',durationMs:200,essential:false,reducedMotionAlternative:false,location}],completedAt:'2026-07-12T00:00:00.000Z'},policy)
    const warning=runDesignGovernance({documentId:'doc',revisionId:'motion-warning',tokens:[],samples:[{kind:'motion',id:'motion',durationMs:501,essential:false,reducedMotionAlternative:true,location}],completedAt:'2026-07-12T00:00:00.000Z'},policy)
    expect(hard.findings.find(({ruleId})=>ruleId==='wcag.motion-reduction')).toMatchObject({severity:'error',blocking:true})
    expect(warning.findings.find(({ruleId})=>ruleId==='motion.duration')).toMatchObject({severity:'warning',blocking:false})
  })

  it('is order-independent, hash-stable, and separates timestamps from evidence identity', () => {
    const a=scenario('text'),b=scenario('ui-boundary'),facts=[fact(a.scenarioId),fact(b.scenarioId,{borderColor:'rgb(0,0,0)',axeViolations:[{id:'z',impact:'minor'},{id:'a',impact:'moderate'}]})]
    const first=evaluateGovernance([a,b],facts,1),second=evaluateGovernance([b,a],[facts[1]!,facts[0]!],999)
    expect(second.evidenceHash).toBe(first.evidenceHash); expect(second.receiptId).toBe(first.receiptId); expect(second.createdAt).not.toBe(first.createdAt)
    expect(second.findings).toEqual(first.findings)
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('fuzzes grayscale and alpha boundaries without NaN, infinity or ratio inversion', () => {
    const subject=scenario('text')
    let previous=21
    for(let channel=0;channel<=255;channel+=3){const ratio=evaluateGovernance([subject],[fact(subject.scenarioId,{foreground:`rgba(${channel},${channel},${channel},${(channel%100)/100})`})],1).findings[0]!.evidence.ratio as number;expect(Number.isFinite(ratio)).toBe(true);expect(ratio).toBeGreaterThanOrEqual(1);expect(ratio).toBeLessThanOrEqual(21);if(channel%100===0)previous=ratio;else expect(previous).toBeGreaterThanOrEqual(1)}
  })

  it('requires approval for brand-lock repair, reruns, and never repairs advisory-only receipts', async () => {
    const locked=scenario('text',true),blocked=evaluateGovernance([locked],[fact(locked.scenarioId,{foreground:'rgb(180,180,180)'})],1),task=createGovernanceRepairTask(blocked,[locked])
    expect(task).toMatchObject({touchesBrandLock:true,requiresHumanApproval:true})
    const repair=vi.fn(async()=>({receiptRef:'repair.receipt'})),rerun=vi.fn(async()=>evaluateGovernance([locked],[fact(locked.scenarioId)],2))
    expect(await rerunGovernanceRepair(task,{repair,rerun})).toMatchObject({status:'approval-required'});expect(repair).not.toHaveBeenCalled()
    expect(await rerunGovernanceRepair(task,{approvalId:'approval.brand',repair,rerun})).toMatchObject({status:'repaired',repairReceiptRef:'repair.receipt',governance:{status:'passed'}})
    const advisory=evaluateGovernance([locked],[fact(locked.scenarioId,{axeViolations:[{id:'review',impact:'minor'}]})],1)
    expect(()=>createGovernanceRepairTask(advisory,[locked])).toThrow('No failed hard')
  })
})
