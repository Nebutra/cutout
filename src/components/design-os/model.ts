import type { DesignOsPanelModel } from './DesignOsPanel'
import type { DesignDocument } from '@/design-ir'
import type { ModelAssignments } from '@/services/ai/model-assignment-types'
import type { ProviderConfig } from '@/services/ai/provider-types'

export interface DesignOsCapabilityContext {
  /** Desktop BYOK connector configuration, never secret material. */
  readonly providers?: readonly ProviderConfig[]
  readonly assignments?: ModelAssignments
  /** No .cutout policy is loaded by the desktop workspace yet. */
  readonly connectorConfigurationPending?: boolean
}

export function designDocumentToDesignOsPanelModel(
  document: DesignDocument,
  context: DesignOsCapabilityContext = {},
): DesignOsPanelModel {
  const enabledProviderIds = new Set(
    (context.providers ?? []).filter((provider) => provider.enabled).map((provider) => provider.id),
  )
  const configuredSlots = ['chat', 'image'].filter((slot) => {
    const assignment = context.assignments?.[slot as keyof ModelAssignments]
    return Boolean(assignment && enabledProviderIds.has(assignment.providerId))
  })
  const connectorCapability = context.connectorConfigurationPending
    ? {
        status: 'unknown' as const,
        detail: 'Checking your connection…',
      }
    : configuredSlots.length > 0
      ? {
          status: 'available' as const,
          detail: `Connected: ${configuredSlots.join(', ')}.`,
        }
      : {
          status: 'unavailable' as const,
          detail: 'No AI model connected yet.',
        }

  return {
    documentId: document.meta.id,
    revisionId: document.revision.id,
    revisionNumber: document.revision.number,
    counts: {
      sources: document.sources.length,
      tokens: document.tokens.length,
      components: document.components.length,
      materials: document.materials.length,
    },
    capabilities: [
      { id: 'design-ir', label: 'Design data', status: 'available', detail: 'Saved and up to date.' },
      { id: 'byok-connector', label: 'AI model connection', ...connectorCapability },
      {
        id: 'headless-policy',
        label: 'Automation policy',
        status: 'unknown',
        detail: 'Not set up for this project.',
      },
    ],
  }
}
