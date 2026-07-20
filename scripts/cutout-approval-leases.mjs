import { createHash, randomUUID } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const PROTOCOL = 'cutout.approval-lease.v1'
const FILE = 'approval-leases.json'

/** Desktop-host boundary. External CLI/MCP surfaces deliberately do not expose this. */
export async function issueApprovalLease(projectRoot, input, now = Date.now()) {
  const lease = {
    protocol: PROTOCOL,
    leaseId: input.leaseId ?? randomUUID(),
    approvalId: input.approvalId,
    subject: input.subject,
    requestDigest: requestDigest(input.operation, input.expectedRevision),
    expectedRevision: input.expectedRevision,
    issuedAt: now,
    expiresAt: input.expiresAt,
    state: 'issued',
  }
  validateLease(lease)
  const catalog = await load(projectRoot)
  if (catalog.leases.some((entry) => entry.leaseId === lease.leaseId)) throw new Error('Approval lease id already exists.')
  await save(projectRoot, { protocol: PROTOCOL, leases: [...catalog.leases, lease] })
  return structuredClone(lease)
}

export async function reserveApprovalLease(projectRoot, leaseId, operation, expectedRevision, now = Date.now()) {
  if (typeof leaseId !== 'string' || !leaseId.trim()) throw new Error('A host-issued approval lease id is required.')
  const catalog = await load(projectRoot)
  const index = catalog.leases.findIndex((entry) => entry.leaseId === leaseId)
  if (index < 0) throw new Error('Approval lease was not issued by this Cutout host.')
  const lease = catalog.leases[index]
  validateLease(lease)
  if (lease.state !== 'issued') throw new Error('Approval lease has already been consumed or reserved.')
  if (now >= lease.expiresAt) throw new Error('Approval lease has expired.')
  if (lease.expectedRevision !== expectedRevision) throw new Error('Approval lease is bound to a different project revision.')
  if (lease.requestDigest !== requestDigest(operation, expectedRevision)) throw new Error('Approval lease is bound to a different request.')
  const reservationId = randomUUID()
  const reserved = { ...lease, state: 'reserved', reservationId, reservedAt: now }
  const leases = catalog.leases.slice()
  leases[index] = reserved
  await save(projectRoot, { protocol: PROTOCOL, leases })
  return { reservationId, approval: { id: lease.approvalId, grantedAt: lease.issuedAt } }
}

export async function completeApprovalLease(projectRoot, leaseId, reservationId, response, now = Date.now()) {
  const catalog = await load(projectRoot)
  const index = catalog.leases.findIndex((entry) => entry.leaseId === leaseId)
  if (index < 0) throw new Error('Approval lease reservation was not found.')
  const lease = catalog.leases[index]
  if (lease.state !== 'reserved' || lease.reservationId !== reservationId) throw new Error('Approval lease reservation does not match.')
  const leases = catalog.leases.slice()
  leases[index] = {
    ...lease,
    state: 'consumed',
    consumedAt: now,
    response: { requestId: response.requestId, status: response.status, revision: response.revision },
  }
  await save(projectRoot, { protocol: PROTOCOL, leases })
}

export function requestDigest(operation, expectedRevision) {
  return createHash('sha256').update(canonical({ expectedRevision, operation })).digest('hex')
}

async function load(projectRoot) {
  try {
    const parsed = JSON.parse(await readFile(resolve(projectRoot, '.cutout', FILE), 'utf8'))
    if (parsed?.protocol !== PROTOCOL || !Array.isArray(parsed.leases)) throw new Error('Invalid approval lease catalog.')
    parsed.leases.forEach(validateLease)
    return parsed
  } catch (error) {
    if (error?.code === 'ENOENT') return { protocol: PROTOCOL, leases: [] }
    throw error
  }
}

async function save(projectRoot, catalog) {
  const path = resolve(projectRoot, '.cutout', FILE)
  const temporary = `${path}.tmp-${randomUUID()}`
  await writeFile(temporary, `${JSON.stringify(catalog, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  await rename(temporary, path)
}

function validateLease(lease) {
  if (!lease || lease.protocol !== PROTOCOL) throw new Error('Invalid approval lease protocol.')
  for (const field of ['leaseId', 'approvalId', 'subject', 'requestDigest']) {
    if (typeof lease[field] !== 'string' || !lease[field].trim()) throw new Error(`Invalid approval lease ${field}.`)
  }
  if (!Number.isInteger(lease.expectedRevision) || lease.expectedRevision < 0) throw new Error('Invalid approval lease revision.')
  if (!Number.isInteger(lease.issuedAt) || !Number.isInteger(lease.expiresAt) || lease.expiresAt <= lease.issuedAt) throw new Error('Invalid approval lease lifetime.')
  if (!['issued', 'reserved', 'consumed'].includes(lease.state)) throw new Error('Invalid approval lease state.')
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
