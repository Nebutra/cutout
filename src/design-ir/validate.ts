import type { Result } from '@/services/types'
import { err, ok } from '@/services/types'
import { validatePrototypePlan } from '@/prototype/prototype-plan'
import {
  designDocumentSchema,
  type DesignDocument,
  type DesignRelation,
  type Material,
  type MaterialRevision,
} from './schema'
import { canonicalJson } from './fingerprint'

export interface ValidatedDesignDocument {
  readonly document: DesignDocument
}

/** Parse the transport shape, then prove cross-collection Design IR invariants. */
export function validateDesignDocument(input: unknown): Result<ValidatedDesignDocument> {
  const parsed = designDocumentSchema.safeParse(input)
  if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'Invalid Design IR document.')

  const document = materializeTokenUsageGraph(parsed.data)
  const collections: ReadonlyArray<readonly { readonly id: string }[]> = [
    document.needs,
    document.sources,
    document.brands,
    document.tokens,
    document.components,
    document.materials,
    document.provenance,
    document.relations,
  ]
  for (const collection of collections) {
    const ids = new Set<string>()
    for (const entry of collection) {
      if (ids.has(entry.id)) return err(`Duplicate id: "${entry.id}".`)
      ids.add(entry.id)
    }
  }

  const sourceIds = new Set(document.sources.map((source) => source.id))
  const provenanceIds = new Set(document.provenance.map((record) => record.id))
  for (const record of document.provenance) {
    for (const sourceId of record.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        return err(`Provenance "${record.id}" references unknown source "${sourceId}".`)
      }
    }
  }

  for (const brand of document.brands) {
    if (brand.provenanceId && !provenanceIds.has(brand.provenanceId)) {
      return err(`Brand "${brand.id}" references unknown provenance "${brand.provenanceId}".`)
    }
  }
  for (const token of document.tokens) {
    if (token.provenanceId && !provenanceIds.has(token.provenanceId)) {
      return err(`Token "${token.id}" references unknown provenance "${token.provenanceId}".`)
    }
    if (token.aliasOf && !document.tokens.some((candidate) => candidate.id === token.aliasOf)) {
      return err(`Token "${token.id}" references unknown alias target "${token.aliasOf}".`)
    }
  }
  for (const component of document.components) {
    if (component.provenanceId && !provenanceIds.has(component.provenanceId)) {
      return err(`Component "${component.id}" references unknown provenance "${component.provenanceId}".`)
    }
    for (const tokenId of component.tokenIds) {
      if (!document.tokens.some((token) => token.id === tokenId)) {
        return err(`Component "${component.id}" references unknown token "${tokenId}".`)
      }
    }
  }

  if (document.prototype?.provenanceId && !provenanceIds.has(document.prototype.provenanceId)) {
    return err(`Prototype "${document.prototype.id}" references unknown provenance "${document.prototype.provenanceId}".`)
  }
  if (document.prototype) {
    const prototypeValidation = validatePrototypePlan(document.prototype.plan)
    if (!prototypeValidation.ok) return err(`Prototype "${document.prototype.id}" is invalid: ${prototypeValidation.error}`)
  }

  for (const material of document.materials) {
    const materialResult = validateMaterial(material, provenanceIds)
    if (!materialResult.ok) return materialResult
  }

  const entityIds = {
    need: new Set(document.needs.map((entry) => entry.id)),
    source: sourceIds,
    brand: new Set(document.brands.map((entry) => entry.id)),
    token: new Set(document.tokens.map((entry) => entry.id)),
    component: new Set(document.components.map((entry) => entry.id)),
    material: new Set(document.materials.map((entry) => entry.id)),
    prototype: new Set(document.prototype ? [document.prototype.id] : []),
  }
  for (const relation of document.relations) {
    if (relation.provenanceId && !provenanceIds.has(relation.provenanceId)) {
      return err(`Relation "${relation.id}" references unknown provenance "${relation.provenanceId}".`)
    }
    if (!hasEntity(entityIds, relation, 'from')) {
      return err(`Relation "${relation.id}" references unknown ${relation.from.kind} "${relation.from.id}".`)
    }
    if (!hasEntity(entityIds, relation, 'to')) {
      return err(`Relation "${relation.id}" references unknown ${relation.to.kind} "${relation.to.id}".`)
    }
  }

  return ok({ document })
}

function hasEntity(
  entityIds: Record<string, ReadonlySet<string>>,
  relation: DesignRelation,
  endpoint: 'from' | 'to',
): boolean {
  const reference = relation[endpoint]
  return entityIds[reference.kind]?.has(reference.id) ?? false
}

/** Concise alias for agent/CLI consumers. */
export const validate = validateDesignDocument

/** Deterministic migration boundary for old IR and generators that only declared component.tokenIds. */
export function materializeTokenUsageGraph(input: DesignDocument): DesignDocument {
  const relations=[...input.relations]
  const relationKeys=new Set(relations.map((relation)=>`${relation.kind}:${relation.from.id}:${relation.to.id}`))
  for(const component of input.components)for(const tokenId of component.tokenIds){const key=`component-uses-token:${component.id}:${tokenId}`;if(!relationKeys.has(key)){relations.push({id:`relation.token-usage.${stableId(component.id)}.${stableId(tokenId)}`,kind:'component-uses-token',from:{kind:'component',id:component.id},to:{kind:'token',id:tokenId}});relationKeys.add(key)}}
  relations.sort((a,b)=>a.id.localeCompare(b.id))
  return {...input,relations}
}

export function tokenUsageGraph(input:DesignDocument){const document=materializeTokenUsageGraph(input);return document.tokens.map((token)=>{const relations=document.relations.filter((relation)=>(relation.kind==='component-uses-token'||relation.kind==='brand-defines-token')&&relation.to.id===token.id);return{tokenId:token.id,status:relations.length?'verified' as const:'evidence-missing' as const,componentIds:relations.filter((relation)=>relation.from.kind==='component').map((relation)=>relation.from.id).sort(),relationIds:relations.map(({id})=>id).sort(),...(relations.length?{}:{reason:'No component or brand usage relation was declared.'})}})}

function stableId(value:string){let hash=2166136261;for(const character of value)hash=Math.imul(hash^character.charCodeAt(0),16777619);return(hash>>>0).toString(16).padStart(8,'0')}

function validateMaterial(material: Material, provenanceIds: ReadonlySet<string>): Result<void> {
  const revisionIds = new Set<string>()
  const ordinals = new Set<number>()
  for (const revision of material.revisions) {
    if (revisionIds.has(revision.id)) return err(`Material "${material.id}" has duplicate revision id "${revision.id}".`)
    revisionIds.add(revision.id)
    if (ordinals.has(revision.ordinal)) return err(`Material "${material.id}" has duplicate revision ordinal ${revision.ordinal}.`)
    ordinals.add(revision.ordinal)
    if (revision.provenanceId && !provenanceIds.has(revision.provenanceId)) {
      return err(`Material revision "${revision.id}" references unknown provenance "${revision.provenanceId}".`)
    }
    if (
      revision.production
      && revision.content.sha256 !== revision.production.artifactSha256
    ) {
      return err(`Material revision "${revision.id}" production hash does not match its content.`)
    }
  }
  if (!revisionIds.has(material.currentRevisionId)) {
    return err(`Material "${material.id}" points to unknown current revision "${material.currentRevisionId}".`)
  }
  return ok(undefined)
}

/**
 * Proves a material update did not rewrite or remove published revisions. New
 * revisions may only be appended after the previous ordinal range.
 */
export function validateMaterialRevisionsImmutable(
  previous: Material,
  next: Material,
): Result<void> {
  if (previous.id !== next.id) return err('Cannot compare revisions of different materials.')

  const nextById = new Map(next.revisions.map((revision) => [revision.id, revision]))
  for (const oldRevision of previous.revisions) {
    const candidate = nextById.get(oldRevision.id)
    if (!candidate) return err(`Material "${previous.id}" removed immutable revision "${oldRevision.id}".`)
    if (!sameRevision(oldRevision, candidate)) {
      return err(`Material "${previous.id}" rewrote immutable revision "${oldRevision.id}".`)
    }
  }

  const priorMaxOrdinal = Math.max(...previous.revisions.map((revision) => revision.ordinal))
  for (const revision of next.revisions) {
    if (!previous.revisions.some((oldRevision) => oldRevision.id === revision.id) && revision.ordinal <= priorMaxOrdinal) {
      return err(`Material "${previous.id}" inserted revision "${revision.id}" into immutable history.`)
    }
  }
  return ok(undefined)
}

function sameRevision(left: MaterialRevision, right: MaterialRevision): boolean {
  return canonicalJson(left) === canonicalJson(right)
}
