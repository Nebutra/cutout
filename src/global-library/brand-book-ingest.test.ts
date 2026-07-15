import { describe,expect,it } from 'vitest'
import { brandCandidateConflicts,confirmBrandCandidates,extractBrandCandidates } from './brand-book-ingest'
const evidence={id:'evidence.page.1',page:1,sourcePath:'brand-book.pdf',sha256:'a'.repeat(64)}
describe('Brand Book evidence extraction',()=>{
 it('extracts only reviewable candidates with evidence and confidence',()=>{const values=extractBrandCandidates({evidence,text:'Primary #FF0055\nTypeface: Inter\nNever stretch the logo\nPhotography: natural light'});expect(values.map(({kind})=>kind)).toEqual(expect.arrayContaining(['color','font','prohibited-use','photo']));expect(values.every((item)=>item.evidenceIds[0]===evidence.id&&item.status==='candidate')).toBe(true)})
 it('requires explicit confirmation and reports conflicting confirmed identities',()=>{const candidates=[...extractBrandCandidates({evidence,text:'Typeface: Inter'}),...extractBrandCandidates({evidence:{...evidence,id:'evidence.page.2'},text:'Typeface: Helvetica'})];const confirmed=confirmBrandCandidates(candidates,new Set(candidates.map(({id})=>id)));expect(brandCandidateConflicts(confirmed)).toEqual([expect.objectContaining({kind:'font'})])})
})
