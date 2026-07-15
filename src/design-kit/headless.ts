import type { DesignDocument, DesignToken } from '@/design-ir'
import { compileDesignKit, type DesignKit, type DesignKitTokenInput } from './compiler'

/**
 * Explicit host adapter for the repo-native Design IR. The generic compiler
 * intentionally does not infer categories or verification. This boundary does
 * only two conservative things that the IR itself proves: maps its closed
 * token kinds to kit categories, and marks every token `draft` because v1 IR
 * has no verification field. CSS names are opaque, deterministic IDs rather
 * than a guess about a token's semantic name.
 */
export async function compileHeadlessDesignKit(document: DesignDocument): Promise<DesignKit> {
  return compileDesignKit({ document, tokens: [...headlessTokenAdapters(document.tokens)] })
}

export function headlessTokenAdapters(tokens: readonly DesignToken[]): readonly DesignKitTokenInput[] {
  const occurrences = new Map<string, number>()
  return [...tokens]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((token) => {
      const category = categoryFor(token)
      const base = `token-${slug(token.id)}`
      const key = `${category}:${base}`
      const occurrence = occurrences.get(key) ?? 0
      occurrences.set(key, occurrence + 1)
      return {
        tokenId: token.id,
        status: 'draft' as const,
        category,
        cssName: occurrence === 0 ? base : `${base}-${occurrence + 1}`,
      }
    })
}

function categoryFor(token: DesignToken): DesignKitTokenInput['category'] {
  switch (token.kind) {
    case 'color': return 'color'
    case 'spacing': return 'spacing'
    case 'radius': return 'radius'
    case 'typography': return 'typography'
    case 'shadow': return 'shadow'
    case 'other': return 'breakpoint'
    case 'motion': throw new Error(`Design Kit v1 cannot export motion token "${token.id}". Add a motion adapter before exporting this revision.`)
  }
}

function slug(value: string): string {
  const result = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return result && /^[a-z]/.test(result) ? result.slice(0, 100) : `id-${result.slice(0, 96) || 'token'}`
}
