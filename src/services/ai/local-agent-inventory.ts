import { invoke } from '@tauri-apps/api/core'
import { z } from 'zod'

const capabilitySupportSchema = z.enum(['supported', 'unsupported'])
const installationStatusSchema = z.enum([
  'not-installed',
  'installed',
  'permission-required',
  'probe-failed',
])
const rootStatusSchema = z.enum([
  'not-found',
  'found',
  'permission-required',
  'probe-failed',
])
const sanitizedLocationSchema = z.string().regex(
  /^(?:~\/[A-Za-z0-9._/-]+|\$[A-Z][A-Z0-9_]*(?:\/[A-Za-z0-9._/-]+)?)$/,
)

const LOCAL_AGENT_IDS = [
  'claude-code', 'codex', 'opencode', 'copilot', 'omp', 'pi', 'cursor',
  'gemini', 'hermes', 'qwen-code', 'kimi', 'amp', 'auggie', 'cline',
  'codebuddy', 'cortex-code', 'corust', 'crow', 'deepagents', 'deepseek-tui',
  'dimcode', 'dirac', 'factory-droid', 'fast-agent', 'glm', 'goose', 'junie',
  'kilo', 'minion-code', 'mistral-vibe', 'nova', 'poolside', 'qoder', 'sigit',
  'stakpak', 'vtcode', 'agoragentic', 'autohand', 'grok',
] as const
const localAgentIdSchema = z.enum(LOCAL_AGENT_IDS)

const registryProvenanceSchema = z.object({
  catalog: z.literal('Paseo 39-Agent catalog'),
  slug: localAgentIdSchema,
  reviewedAt: z.literal('2026-07-27'),
}).strict()

const installationSchema = z.object({
  status: installationStatusSchema,
  executableAlias: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/).optional(),
}).strict()

const configRootSchema = z.object({
  label: sanitizedLocationSchema,
  status: rootStatusSchema,
  markers: z.array(sanitizedLocationSchema).max(16),
}).strict()

export const localAgentInventoryRowSchema = z.object({
  id: localAgentIdSchema,
  displayName: z.string().min(1).max(80),
  cliAliases: z.array(z.string().regex(/^[A-Za-z0-9._-]{1,64}$/)).min(1).max(8),
  provenance: registryProvenanceSchema,
  installation: installationSchema,
  configRoots: z.array(configRootSchema).max(8),
  capabilities: z.object({
    credentialAdapter: capabilitySupportSchema,
    sessionDelegation: capabilitySupportSchema,
  }).strict(),
}).strict().superRefine((row, context) => {
  if (row.provenance.slug !== row.id) {
    context.addIssue({
      code: 'custom',
      path: ['provenance', 'slug'],
      message: 'Provenance slug must match the Agent ID.',
    })
  }
  if (row.installation.executableAlias !== undefined) {
    if (row.installation.status !== 'installed') {
      context.addIssue({
        code: 'custom',
        path: ['installation', 'executableAlias'],
        message: 'Only installed Agents may report an executable alias.',
      })
    }
    if (!row.cliAliases.includes(row.installation.executableAlias)) {
      context.addIssue({
        code: 'custom',
        path: ['installation', 'executableAlias'],
        message: 'Executable alias must be registered for the Agent.',
      })
    }
  }
  for (const [rootIndex, root] of row.configRoots.entries()) {
    if (root.status !== 'found' && root.markers.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['configRoots', rootIndex, 'markers'],
        message: 'Only found roots may report markers.',
      })
    }
    for (const [markerIndex, marker] of root.markers.entries()) {
      if (!marker.startsWith(`${root.label}/`)) {
        context.addIssue({
          code: 'custom',
          path: ['configRoots', rootIndex, 'markers', markerIndex],
          message: 'Marker must stay below its sanitized root label.',
        })
      }
    }
  }
})

export type LocalAgentInventoryRow = z.infer<typeof localAgentInventoryRowSchema>

export async function discoverLocalAgentInventory(): Promise<LocalAgentInventoryRow[]> {
  const raw = await invoke<unknown>('discover_local_agent_inventory')
  const rows = z.array(localAgentInventoryRowSchema).length(39).parse(raw)
  if (new Set(rows.map((row) => row.id)).size !== rows.length) {
    throw new Error('Local Agent inventory contains duplicate IDs.')
  }
  if (rows.some((row, index) => row.id !== LOCAL_AGENT_IDS[index])) {
    throw new Error('Local Agent inventory does not match the pinned catalog.')
  }
  return rows
}
