import type { DesignOsWorkbenchModel, DesignOsReceipt } from './DesignOsWorkbench'
import { buildTokenContrastGovernance } from './token-governance'
import { designDocumentToDesignOsPanelModel, type DesignOsCapabilityContext } from '@/components/design-os/model'
import { authoringForDocument, buildDesignOsReadiness, type AuthoringPreview, type DesignOsAuthoringState, type SourceIngestPreview } from '@/design-os-operations'
import type { DesignDocument, SourceLicense } from '@/design-ir'
import type { NativeRepositoryScanResult } from '@/platform/native'
import type { CompositeDeliveryReceipt, DeliveryPlan } from '@/delivery-center'

export interface LiveDesignOsArtifacts {
  readonly ingestPreview?: SourceIngestPreview
  readonly designKitReceipt?: DesignOsReceipt
  readonly authoring?: DesignOsAuthoringState | null
  readonly authoringPreview?: AuthoringPreview
  readonly repositoryIngest?: { readonly previewId: string; readonly scan: NativeRepositoryScanResult; readonly role: string; readonly license: string }
  readonly deliveryPlan?: DeliveryPlan | null
  readonly deliveryReceipt?: CompositeDeliveryReceipt | null
}

export function buildLiveDesignOsWorkbenchModel(
  document: DesignDocument,
  capabilities: DesignOsCapabilityContext = {},
  artifacts: LiveDesignOsArtifacts = {},
): DesignOsWorkbenchModel {
  const readiness = buildDesignOsReadiness(document)
  const designKit = readiness.operations['design-kit']
  const brandKit = readiness.operations['brand-kit']
  const components = readiness.operations.components
  const starter = readiness.operations.starter
  const authoring = authoringForDocument(document, artifacts.authoring)
  const authoringPreview = artifacts.authoringPreview
    && artifacts.authoringPreview.base.documentId === document.meta.id
    && artifacts.authoringPreview.base.revisionId === document.revision.id
    ? artifacts.authoringPreview : undefined
  const ingestPreview = artifacts.ingestPreview
    && artifacts.ingestPreview.base.documentId === document.meta.id
    && artifacts.ingestPreview.base.revisionId === document.revision.id
    && artifacts.ingestPreview.base.revisionNumber === document.revision.number
    ? artifacts.ingestPreview
    : undefined

  // Live governance from the design's color tokens (WCAG text contrast) — the
  // data source that makes `model.governance` / the "Request repair" UI real.
  const governance = buildTokenContrastGovernance(document.tokens)

  return {
    summary: designDocumentToDesignOsPanelModel(document, capabilities),
    ...(governance ? { governance } : {}),
    sources: document.sources.map((source) => ({
      id: source.id,
      label: source.title,
      kind: source.kind,
      role: source.role,
      license: licenseLabel(source.license),
      provenance: provenanceLabel(document, source.id),
      detail: source.ingestion?.relativePath ?? source.ingestion?.url ?? source.content[0]?.uri,
      ...(source.kind === 'url' && source.content[0]?.uri ? { href: source.content[0].uri } : {}),
    })),
    ...(ingestPreview ? {
      ingestPreview: {
        id: previewId(ingestPreview),
        title: 'Source ingest preview',
        summary: ingestPreview.impact.noChanges
          ? 'This content is already present; approval will not create another revision.'
          : `Revision ${ingestPreview.base.revisionNumber} → ${ingestPreview.impact.nextRevisionNumber}`,
        sourceCount: ingestPreview.impact.sourcesAdded,
        warnings: ingestPreview.skipped.map((skip) => skip.detail ?? skip.reason),
        ...(artifacts.repositoryIngest?.previewId === previewId(ingestPreview) ? {
          repository: {
            fileCount: artifacts.repositoryIngest.scan.entries.length,
            frameworks: artifacts.repositoryIngest.scan.frameworkHints.map((hint) => ({ name: hint.framework, confidence: hint.confidence, evidence: hint.evidence })),
            exclusions: Object.entries(artifacts.repositoryIngest.scan.excluded).map(([label, count]) => ({ label: humanize(label), count })),
            role: artifacts.repositoryIngest.role,
            license: artifacts.repositoryIngest.license,
          },
        } : {}),
      },
    } : {}),
    ...(authoring ? { authoringValues: {
      ...(authoring.brand ? { brand: authoring.brand } : {}),
      ...(authoring.componentCandidates ? { components: authoring.componentCandidates } : {}),
      ...(authoring.starterConfigs?.[0] ? { starter: authoring.starterConfigs[0] } : {}),
    } } : {}),
    ...(authoringPreview ? { authoringPreview: { id: authoringPreview.id, kind: authoringPreview.kind, summary: authoringPreview.summary } } : {}),
    kits: [
      {
        id: 'kit:design-system',
        label: 'Design System Kit',
        description: 'DESIGN.md, CSS variables, Tailwind v4 theme, tokens, and manifest.',
        readiness: designKit.state === 'ready' ? 'ready' : 'blocked',
        blockers: designKit.reasons.map((entry) => entry.message),
        ...(artifacts.designKitReceipt ? { receipt: artifacts.designKitReceipt } : {}),
      },
      {
        id: 'kit:brand',
        label: 'Brand VI Kit',
        description: 'Only explicit, licensed and evidence-backed brand claims can be exported.',
        readiness: brandKit.state === 'ready' && authoring?.brand ? 'ready' : 'blocked',
        blockers: [...brandKit.reasons.map((entry) => entry.message), ...(authoring?.brand ? [] : ['No explicit BrandKitDefinition is stored in this workspace revision.'])],
      },
    ],
    components: [{
      id: 'component:manifest',
      label: 'Component manifest',
      description: 'Props, variants, slots, page bindings, and shadcn adapter plan.',
      readiness: components.state === 'ready' && authoring?.componentCandidates?.length ? 'ready' : 'blocked',
      blockers: [...components.reasons.map((entry) => entry.message), ...(authoring?.componentCandidates?.length ? [] : ['No explicit component candidate declarations are stored in this workspace revision.'])],
    }],
    componentReadinessFacts: {
      hasStructuredPrototype: Boolean(document.prototype),
      hasTokens: document.tokens.length > 0,
      hasExplicitCandidates: Boolean(authoring?.componentCandidates?.length),
    },
    starters: [
      starterItem('starter:next', 'Next.js App Router starter', 'next-app-router', starter.reasons.map((entry) => entry.message), authoring),
      starterItem('starter:vite', 'Vite React starter', 'vite-react', starter.reasons.map((entry) => entry.message), authoring),
      starterItem('starter:nuxt', 'Nuxt starter', 'nuxt', starter.reasons.map((entry) => entry.message), authoring),
      starterItem('starter:tanstack', 'TanStack Start starter', 'tanstack-start', starter.reasons.map((entry) => entry.message), authoring),
    ],
    delivery: {
      targets: [
        { id: 'delivery:design-system', kind: 'design-system', label: 'Design System Kit', destinationLabel: 'Choose a local export folder', available: designKit.state === 'ready', ...(designKit.state === 'ready' ? {} : { unavailableReason: designKit.reasons[0]?.message ?? 'Design System is not ready.' }) },
        { id: 'delivery:brand-kit', kind: 'brand-kit', label: 'Brand VI Kit', destinationLabel: 'Choose a local export folder', available: brandKit.state === 'ready' && Boolean(authoring?.brand), ...(brandKit.state === 'ready' && authoring?.brand ? {} : { unavailableReason: brandKit.reasons[0]?.message ?? 'Store an explicit Brand Kit definition first.' }) },
        { id: 'delivery:components', kind: 'components', label: 'Components', destinationLabel: 'Choose a local export folder', available: components.state === 'ready' && Boolean(authoring?.componentCandidates?.length), ...(components.state === 'ready' && authoring?.componentCandidates?.length ? {} : { unavailableReason: components.reasons[0]?.message ?? 'Declare component candidates first.' }) },
        { id: 'delivery:starter', kind: 'starter', label: 'Starter project', destinationLabel: 'Choose a local export folder', available: starter.state === 'ready' && Boolean(authoring?.starterConfigs?.length), ...(starter.state === 'ready' && authoring?.starterConfigs?.length ? {} : { unavailableReason: starter.reasons[0]?.message ?? 'Choose and validate a Starter configuration first.' }) },
        { id: 'delivery:registry', kind: 'registry', label: 'Source registry', destinationLabel: 'Controlled repository', available: false, unavailableReason: 'Desktop repository host is not connected.' },
        { id: 'delivery:github', kind: 'github', label: 'GitHub', destinationLabel: 'Branch or pull request', available: false, unavailableReason: 'No authorized GitHub host/session.' },
        { id: 'delivery:notion', kind: 'notion', label: 'Notion', destinationLabel: 'Guideline page', available: false, unavailableReason: 'No authorized Notion host/session.' },
      ],
      ...(artifacts.deliveryPlan?.designRevision.revisionId === document.revision.id ? { plan: artifacts.deliveryPlan } : {}),
      ...(artifacts.deliveryReceipt?.designRevision.revisionId === document.revision.id ? { receipt: artifacts.deliveryReceipt } : {}),
    },
  }
}

function humanize(value: string): string { return value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase() }

export function previewId(preview: SourceIngestPreview): string {
  return [preview.base.documentId, preview.base.revisionId, ...preview.patch.sources.map((source) => source.id)].join('|')
}

function starterItem(id: string, label: string, framework: 'next-app-router' | 'vite-react' | 'nuxt' | 'tanstack-start', baseBlockers: readonly string[], authoring?: DesignOsAuthoringState) {
  const hasComponents = Boolean(authoring?.componentCandidates?.length)
  const hasConfig = Boolean(authoring?.starterConfigs?.some((item) => item.framework === framework))
  return {
    id,
    label,
    description: 'Requires a matching Design Kit and ready Component Manifest from this exact revision.',
    readiness: baseBlockers.length === 0 && hasComponents && hasConfig ? 'ready' as const : 'blocked' as const,
    blockers: [...baseBlockers, ...(hasComponents ? [] : ['No explicit ready Component Manifest is stored in this workspace revision.']), ...(hasConfig ? [] : [`No ${framework} StarterConfig is stored in this workspace revision.`])],
  }
}

function provenanceLabel(document: DesignDocument, sourceId: string): string {
  const records = document.provenance.filter((record) => record.sourceIds.includes(sourceId))
  return records.length > 0 ? records.map((record) => record.tool ?? record.operation).join(', ') : 'Not recorded'
}

function licenseLabel(license: SourceLicense): string {
  switch (license.kind) {
    case 'spdx': return license.identifier
    case 'proprietary': return `Proprietary · ${license.holder}`
    case 'public-domain': return 'Public domain'
    case 'unknown': return `Unknown · ${license.rationale}`
  }
}
