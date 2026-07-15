import type { DesignSource, SourceKind, SourceLicense, SourceRole } from '@/design-ir'
import { ingestEverything, type EverythingInput, type SourcePatch } from './everything-inbox'

export type InboxSourceStatus = 'ready' | 'duplicate' | 'queued' | 'adapter-required' | 'invalid'
export type InboxSourceType = SourceKind | 'repository' | 'integration'

export interface InboxCandidate {
  readonly id: string
  readonly type: InboxSourceType
  readonly title: string
  readonly role: SourceRole
  readonly license: SourceLicense
  readonly status: InboxSourceStatus
  readonly expectedUse: string
  readonly input?: EverythingInput
  readonly integrationId?: string
  readonly detail?: string
}

export interface EverythingInboxPreview {
  readonly candidates: readonly InboxCandidate[]
  readonly patch: SourcePatch
  readonly readyCount: number
  readonly duplicateCount: number
  readonly adapterRequiredCount: number
}

export type InboxSelection =
  | { readonly kind: 'text'; readonly title?: string; readonly text: string; readonly hint?: Extract<SourceKind, 'need' | 'story' | 'idea' | 'document' | 'code'> }
  | { readonly kind: 'file'; readonly file: { readonly name: string; readonly mediaType?: string; readonly bytes: Uint8Array } }
  | { readonly kind: 'url'; readonly url: string; readonly title?: string }
  | { readonly kind: 'repository'; readonly input: Extract<EverythingInput, { type: 'repository-snapshot' }> }
  | { readonly kind: 'integration'; readonly integrationId: string; readonly title: string; readonly authorizedInput?: EverythingInput }

const ownerLicense = { kind: 'proprietary', holder: 'Project owner' } as const

export async function previewEverythingInbox(
  selections: readonly InboxSelection[],
  options: { readonly existingSources?: readonly DesignSource[]; readonly capturedAt?: string; readonly actorId?: string } = {},
): Promise<EverythingInboxPreview> {
  const candidates: InboxCandidate[] = []
  const sources: DesignSource[] = []
  const provenance: SourcePatch['provenance'][number][] = []
  for (let index = 0; index < selections.length; index++) {
    const selection = selections[index]!
    const candidate = selectionToCandidate(selection, index)
    if (!candidate.input) { candidates.push(candidate); continue }
    const result = await ingestEverything(candidate.input, {
      capturedAt: options.capturedAt,
      actorId: options.actorId,
      existingSources: [...(options.existingSources ?? []), ...sources],
    })
    if (!result.ok) { candidates.push({ ...candidate, status: 'invalid', detail: result.error }); continue }
    const duplicate = result.data.skipped.some((item) => item.reason === 'duplicate-content')
    if (duplicate) candidates.push({ ...candidate, status: 'duplicate', detail: 'Already attached by content hash.' })
    else {
      candidates.push(candidate)
      sources.push(...result.data.patch.sources); provenance.push(...result.data.patch.provenance)
    }
  }
  return {
    candidates,
    patch: { sources, provenance },
    readyCount: candidates.filter((item) => item.status === 'ready').length,
    duplicateCount: candidates.filter((item) => item.status === 'duplicate').length,
    adapterRequiredCount: candidates.filter((item) => item.status === 'adapter-required').length,
  }
}

export interface OutcomeSourceProjection {
  readonly needs: readonly { readonly id: string; readonly statement: string; readonly materialRefs: readonly string[] }[]
  readonly materialRefs: readonly string[]
}

/** Projects approved sources into outcome inputs without claiming semantic processing. */
export function projectSourcesToOutcome(sources: readonly DesignSource[]): OutcomeSourceProjection {
  const materialRefs = sources.map((source) => source.id).sort()
  if (materialRefs.length === 0) return { needs: [], materialRefs: [] }
  const requirementSources = sources.filter((source) => source.role === 'requirement')
  const needs = requirementSources.map((source) => ({
    id: `need:source:${source.id.replace(/^source:/, '').replace(/[^a-z0-9:._-]+/gi, '-').toLowerCase()}`,
    statement: source.title,
    materialRefs: [source.id],
  }))
  return {
    needs: needs.length ? needs : [{ id: 'need:source-context', statement: 'Use the approved source material as outcome context.', materialRefs }],
    materialRefs,
  }
}

function selectionToCandidate(selection: InboxSelection, index: number): InboxCandidate {
  const base = { id: `inbox:${index}`, role: 'reference' as SourceRole, license: ownerLicense }
  if (selection.kind === 'integration' && !selection.authorizedInput) return { ...base, type: 'integration', title: selection.title, integrationId: selection.integrationId, status: 'adapter-required', expectedUse: 'Import through the authorized integration adapter.', detail: 'No authorized integration payload is available.' }
  if (selection.kind === 'integration') return { ...base, type: 'integration', title: selection.title, integrationId: selection.integrationId, status: 'ready', expectedUse: 'Use as connected product context.', input: selection.authorizedInput }
  if (selection.kind === 'repository') return { ...base, type: 'repository', title: selection.input.label, status: 'ready', expectedUse: 'Guide stack-aware coding delivery.', input: selection.input }
  if (selection.kind === 'url') return { ...base, type: 'url', title: selection.title ?? hostname(selection.url), status: 'ready', expectedUse: 'Keep as a reference descriptor; Cutout does not fetch it.', input: { type: 'url-descriptor', url: selection.url, ...(selection.title ? { title: selection.title } : {}), role: 'reference', license: ownerLicense } }
  if (selection.kind === 'text') {
    const sourceKind = selection.hint ?? detectTextKind(selection.text)
    const requirement = sourceKind === 'need' || sourceKind === 'story' || sourceKind === 'idea'
    return { ...base, type: sourceKind, title: selection.title?.trim() || titleFor(sourceKind), role: requirement ? 'requirement' : 'reference', status: 'ready', expectedUse: requirement ? 'Shape the outcome and acceptance criteria.' : 'Guide implementation and design decisions.', input: { type: 'inline-text', sourceKind, title: selection.title?.trim() || titleFor(sourceKind), text: selection.text, role: requirement ? 'requirement' : 'reference', license: ownerLicense } }
  }
  const sourceKind = detectFileKind(selection.file.name, selection.file.mediaType)
  const video = sourceKind === 'video'
  return { ...base, type: sourceKind, title: selection.file.name, status: video ? 'adapter-required' : 'ready', expectedUse: video ? 'Queue for a future authorized video processor.' : sourceKind === 'code' ? 'Guide implementation.' : 'Guide visual direction and composition.', detail: video ? 'Video processing is not available in this host.' : undefined, input: video ? undefined : { type: 'local-file', path: selection.file.name, bytes: selection.file.bytes, sourceKind, mediaType: selection.file.mediaType, title: selection.file.name, role: 'reference', license: ownerLicense } }
}

export function detectFileKind(name: string, mediaType = ''): Extract<SourceKind, 'document' | 'code' | 'screenshot' | 'photo' | 'video'> {
  if (mediaType.startsWith('video/') || /\.(?:mp4|mov|webm|mkv)$/i.test(name)) return 'video'
  if (mediaType.startsWith('image/') || /\.(?:png|jpe?g|webp|gif)$/i.test(name)) return /(?:screen[-_ ]?shot|截屏|截图)/i.test(name) ? 'screenshot' : 'photo'
  if (/\.(?:[cm]?[jt]sx?|vue|svelte|css|scss|html|py|rs|go)$/i.test(name)) return 'code'
  return 'document'
}
function detectTextKind(text: string): Extract<SourceKind, 'need' | 'story' | 'idea' | 'document' | 'code'> {
  if (/```|\b(?:function|const|class|import|export)\b/.test(text)) return 'code'
  if (/\b(?:as a|i want|so that)\b/i.test(text)) return 'story'
  if (/\b(?:must|need|require|should)\b|需要|必须|需求/i.test(text)) return 'need'
  return 'idea'
}
function titleFor(kind: SourceKind) { return kind === 'need' ? 'Need' : kind === 'story' ? 'Story' : kind === 'code' ? 'Code' : kind === 'document' ? 'Document' : 'Idea' }
function hostname(url: string) { try { return new URL(url).hostname } catch { return 'URL' } }
