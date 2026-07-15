import type { PrototypePage, PrototypePlan } from './prototype-plan'
import { createPrototypeAssetManifest } from './asset-manifest'

const GENERIC_NAME_RE = /^(generated-sheet|asset|source|mockup|semantic)[-_]?\d+\.png$/i

export function isGenericSliceFilename(name: string): boolean {
  return GENERIC_NAME_RE.test(name.trim())
}

export function fallbackPrototypeSliceNames(
  plan: PrototypePlan,
  pages: readonly PrototypePage[],
  count: number,
): string[] {
  const candidates = createPrototypeAssetManifest(plan, pages).assets.map(
    (asset) => asset.recommendedName,
  )
  const names: string[] = []
  const used = new Map<string, number>()

  for (let index = 0; index < count; index += 1) {
    const candidate = candidates[index] ?? `visual-asset-${index + 1}`
    const slug = slugify(candidate) || `visual-asset-${index + 1}`
    const seen = used.get(slug) ?? 0
    used.set(slug, seen + 1)
    names.push(seen === 0 ? slug : `${slug}-${seen + 1}`)
  }

  return names
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .split('')
    .filter((character) => character.charCodeAt(0) <= 127)
    .join('')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}
