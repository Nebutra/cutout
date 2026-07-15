import type { GlobalLibraryItem } from '@/global-library'

export const BRAND_SECTIONS = [
  ['Logo', /logo|mark|symbol/i], ['Typography', /font|type|typography/i],
  ['Color', /color|colour|palette|token/i], ['Photography', /photo|image|photography/i],
  ['Design guidance', /guidance|principle|direction/i], ['Brand guideline', /brand.*(?:md|pdf)|guideline|brand-book/i],
] as const

export const DESIGN_TABS = [
  ['DESIGN.md', /(^|\/)design\.md$/i], ['Tailwind v4', /tailwind/i],
  ['CSS Variables', /variables?\.css|css-variables/i], ['Design Tokens', /tokens?.*\.(json|ya?ml|css)$/i],
  ['Astryx', /astryx/i],
] as const

export function auditKit(item:GlobalLibraryItem) {
  const groups=item.kind==='brand-kit'?BRAND_SECTIONS:DESIGN_TABS
  const missing=groups.filter(([,pattern])=>!item.content.artifacts.some((artifact)=>pattern.test(artifact.path))).map(([label])=>label)
  const paths=new Map<string,Set<string>>()
  for(const artifact of item.content.artifacts){const values=paths.get(artifact.path)??new Set<string>();values.add(artifact.sha256);paths.set(artifact.path,values)}
  const conflicts=[...paths].filter(([,hashes])=>hashes.size>1).map(([path])=>path)
  return {present:groups.length-missing.length,missing,conflicts}
}
