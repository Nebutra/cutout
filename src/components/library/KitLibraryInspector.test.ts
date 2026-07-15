import { describe, expect, it } from 'vitest'
import { auditKit } from './kit-library-audit'
import type { GlobalLibraryItem } from '@/global-library'

const item = (kind: GlobalLibraryItem['kind'], paths: readonly string[]): GlobalLibraryItem => ({
  protocol:'cutout.global-library.v1', id:'kit.test', version:'1.0.0', kind, name:'Test kit', description:'Approved kit', contentSha256:'a'.repeat(64),
  content:{manifestPath:'manifest.json',manifestSha256:'b'.repeat(64),artifacts:paths.map((path,index)=>({path,sha256:String(index+1).repeat(64),mediaType:'text/plain',size:12}))},
  origin:{kind:'bundled',producer:'cutout'},license:{kind:'proprietary',holder:'Owner',usage:'Project use'},tags:[],collections:[],favorite:false,pinned:false,dependencies:[],compatibility:[],qualityReceipts:[],lineage:{root:{itemId:'kit.test',version:'1.0.0',contentSha256:'a'.repeat(64)},depth:0},createdAt:'2026-07-12T00:00:00.000Z',updatedAt:'2026-07-12T00:00:00.000Z',
})

describe('kit library audit projection', () => {
  it('reports missing brand sections from authoritative artifact paths', () => {
    const report = auditKit(item('brand-kit', ['logo.svg','colors.json','brand-guideline.pdf']))
    expect(report.missing).toEqual(expect.arrayContaining(['Typography','Photography','Design guidance']))
    expect(report.present).toBe(3)
  })

  it('recognizes the complete design system delivery surface', () => {
    const report = auditKit(item('design-system-kit', ['DESIGN.md','tailwind.config.ts','styles/variables.css','tokens/design.tokens.json','astryx/config.json']))
    expect(report.missing).toEqual([])
    expect(report.present).toBe(5)
  })
})
