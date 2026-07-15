/**
 * Reads a hand-edited demo.html back into token value changes, so the demo
 * is not just an output — a person (or the Agent, on their behalf) can edit
 * the rendered CSS custom properties in demo.html and sync those edits back
 * onto the same tokens the specimen was compiled from. Detection only; the
 * caller always shows the diff for explicit approval before applying it.
 */
import type { DesignDocument, DesignDocumentRevision, DesignToken, Provenance } from '@/design-ir'
import { validateDesignDocument } from '@/design-ir'
import { err, ok, type Result } from '@/services/types'
import { headlessTokenAdapters } from './headless'

export interface TokenValueChange {
  readonly tokenId: string
  readonly name: string
  readonly previousValue: string
  readonly nextValue: string
}

/** Extracts every `--name: value;` custom property declaration found anywhere in the text. */
export function parseCssCustomProperties(css: string): Record<string, string> {
  const declared: Record<string, string> = {}
  const pattern = /--([a-zA-Z0-9-]+)\s*:\s*([^;{}]+);/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(css))) {
    const [, name, rawValue] = match
    if (!name) continue
    declared[name] = (rawValue ?? '').trim()
  }
  return declared
}

/**
 * Compares demo.html's custom-property values against the document's current
 * token values, using the same `--cutout-{category}-{cssName}` naming the
 * compiler already emits (via headlessTokenAdapters). Only tokens whose
 * value actually changed are reported; unmapped/unknown custom properties
 * (a hand-added variable, or a token kind the kit can't export) are ignored.
 */
export function diffDemoHtmlTokens(document: DesignDocument, demoHtmlContent: string): TokenValueChange[] {
  const declared = parseCssCustomProperties(demoHtmlContent)
  const adapters = headlessTokenAdapters(exportableTokens(document.tokens))
  const tokenIdByVarName = new Map(adapters.map((adapter) => [`cutout-${adapter.category}-${adapter.cssName}`, adapter.tokenId]))
  const tokensById = new Map(document.tokens.map((token) => [token.id, token]))

  const changes: TokenValueChange[] = []
  for (const [varName, rawNextValue] of Object.entries(declared)) {
    const tokenId = tokenIdByVarName.get(varName)
    if (!tokenId) continue
    const token = tokensById.get(tokenId)
    if (!token) continue
    const nextValue = rawNextValue.trim()
    // A `var(...)` reference is an alias pointer written by our own compiler
    // (renderTokensCss), not a literal edit — nothing to attribute a value
    // change to.
    if (!nextValue || nextValue.startsWith('var(')) continue
    if (nextValue === token.value) continue
    changes.push({ tokenId: token.id, name: token.name, previousValue: token.value, nextValue })
  }
  return changes
}

export interface ApplyTokenValueChangesRevision {
  readonly id: string
  readonly createdAt: string
  readonly actor: { readonly kind: 'human' | 'agent'; readonly id: string }
  /** The already-ingested demo.html source id — required provenance evidence for the edit. */
  readonly sourceId: string
}

/** Applies a reviewed set of token value changes as one new revision with one provenance record. */
export function applyTokenValueChanges(
  document: DesignDocument,
  changes: readonly TokenValueChange[],
  revision: ApplyTokenValueChangesRevision,
): Result<DesignDocument> {
  if (changes.length === 0) return err('No token value changes to apply.')
  if (!document.sources.some((source) => source.id === revision.sourceId)) {
    return err(`Unknown source "${revision.sourceId}" for token sync provenance.`)
  }
  const changeByTokenId = new Map(changes.map((change) => [change.tokenId, change]))
  for (const tokenId of changeByTokenId.keys()) {
    if (!document.tokens.some((token) => token.id === tokenId)) {
      return err(`Token sync references unknown token "${tokenId}".`)
    }
  }

  const provenanceRecordId = `provenance:demo-html-sync:${revision.id}`
  const provenance: Provenance = {
    id: provenanceRecordId,
    operation: 'edit',
    sourceIds: [revision.sourceId],
    actor: revision.actor,
    recordedAt: revision.createdAt,
    tool: 'design-kit.demo-html-token-sync',
  }

  const tokens: DesignToken[] = document.tokens.map((token) => {
    const change = changeByTokenId.get(token.id)
    if (!change) return token
    return { ...token, value: change.nextValue, provenanceId: provenanceRecordId }
  })

  const next: DesignDocument = {
    ...document,
    meta: { ...document.meta, updatedAt: revision.createdAt },
    revision: {
      ...document.revision,
      id: revision.id,
      number: document.revision.number + 1,
      createdAt: revision.createdAt,
      author: revision.actor,
    } satisfies DesignDocumentRevision,
    tokens,
    provenance: [...document.provenance, provenance],
  }

  const validation = validateDesignDocument(next)
  return validation.ok ? ok(validation.data.document) : validation
}

/** Design Kit v1 has no motion adapter (headlessTokenAdapters throws on it) — excluded before diffing, not a diff target anyway. */
function exportableTokens(tokens: readonly DesignToken[]): readonly DesignToken[] {
  return tokens.filter((token) => token.kind !== 'motion')
}
