import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const defaultRoot = resolve(import.meta.dirname, '..')

export function createExternalControl(root = defaultRoot) {
  const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'))

  return {
    async discoveryHandshake(projectRoot, client = {}) {
      const [capabilities, skills] = await Promise.all([readJson('cutout.agent-capabilities.json'), readJson('skills/index.json')])
      return {
        protocol: 'cutout.external-controller.v1',
        controller: { kind: 'external-coding-agent', clientName: clean(client.name, 'unknown-client'), clientVersion: clean(client.version, 'unknown'), sessionId: randomUUID() },
        binding: { kind: 'local-project', id: createHash('sha256').update(resolve(projectRoot)).digest('hex').slice(0, 24), rootOwnedByHost: true },
        product: capabilities.product,
        controlProtocol: capabilities.protocol.control,
        defaultMode: capabilities.policy.defaultMode,
        workflows: ['discover', 'bind', 'submit-outcome', 'reference-materials', 'preview', 'approve', 'apply', 'observe', 'cancel', 'read-deliverables'],
        skills: { catalogVersion: skills.version, count: skills.skills.length, listTool: 'cutout_skills_list', readTool: 'cutout_skill_read' },
        boundaries: { controllerOwnsCodingSandbox: true, cutoutOwnsProjectState: true, approvalIdsAreUserGranted: true, integrationsAreSeparate: true, arbitraryPaths: false, credentialsInRequests: false },
      }
    },

    async listSkills() {
      const catalog = await readJson('skills/index.json')
      return { version: catalog.version, skills: catalog.skills.map(({ id, status, operations, mcpTools }) => ({ id, status, operations, mcpTools })) }
    },

    async readSkill(skillId, section = 'workflow') {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skillId)) throw new Error('Invalid skill id.')
      const catalog = await readJson('skills/index.json')
      const skill = catalog.skills.find(({ id }) => id === skillId)
      if (!skill) return { ok: false, error: { code: 'capability-required', message: `Unknown Cutout skill: ${skillId}` } }
      const path = section === 'reference' ? skill.reference : `${skill.path}/SKILL.md`
      return { ok: true, skill: { id: skill.id, status: skill.status, section, content: await readFile(resolve(root, path), 'utf8') } }
    },

    async capabilityStatus() {
      const manifest = await readJson('cutout.agent-capabilities.json')
      return { version: manifest.version, externalControllers: manifest.externalControllers, integrations: manifest.integrations, operations: manifest.operations, limitations: manifest.limitations }
    },
  }
}

const defaultControl = createExternalControl()
export const {
  capabilityStatus,
  discoveryHandshake,
  listSkills,
  readSkill,
} = defaultControl

function clean(value, fallback) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,79}$/.test(value)) return fallback
  if (/(?:\bBearer\s+|\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|secret|credential|api[-_ ]?key|password|token)/i.test(value)) return fallback
  return value
}
