import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { constants } from 'node:fs'
import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const PROTOCOL = 'cutout.approval-lease.v1'
const FILE = 'approval-leases.json'
const KEY_FILE = join(homedir(), '.cutout', 'approval-lease.key')

/** Desktop-host boundary. External CLI/MCP surfaces deliberately do not expose this. */
export async function issueApprovalLease(projectRoot, input, now = Date.now(), key) {
  const hostKey = await approvalKey(key)
  const unsigned = {
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
  const lease = signLeaseRecord(unsigned, hostKey)
  validateLease(lease)
  const catalog = await load(projectRoot, hostKey)
  if (catalog.leases.some((entry) => entry.leaseId === lease.leaseId)) throw new Error('Approval lease id already exists.')
  await save(projectRoot, { protocol: PROTOCOL, leases: [...catalog.leases, lease] })
  return structuredClone(lease)
}

export async function reserveApprovalLease(projectRoot, leaseId, operation, expectedRevision, now = Date.now(), key) {
  if (typeof leaseId !== 'string' || !leaseId.trim()) throw new Error('A host-issued approval lease id is required.')
  const hostKey = await approvalKey(key)
  const catalog = await load(projectRoot, hostKey)
  const index = catalog.leases.findIndex((entry) => entry.leaseId === leaseId)
  if (index < 0) throw new Error('Approval lease was not issued by this Cutout host.')
  const lease = catalog.leases[index]
  validateLease(lease)
  if (lease.state !== 'issued') throw new Error('Approval lease has already been consumed or reserved.')
  if (now >= lease.expiresAt) throw new Error('Approval lease has expired.')
  if (lease.expectedRevision !== expectedRevision) throw new Error('Approval lease is bound to a different project revision.')
  if (lease.requestDigest !== requestDigest(operation, expectedRevision)) throw new Error('Approval lease is bound to a different request.')
  const reservationId = randomUUID()
  const reserved = signLeaseRecord({ ...lease, state: 'reserved', reservationId, reservedAt: now }, hostKey)
  const leases = catalog.leases.slice()
  leases[index] = reserved
  await save(projectRoot, { protocol: PROTOCOL, leases })
  return { reservationId, approval: { id: lease.approvalId, grantedAt: lease.issuedAt } }
}

export async function completeApprovalLease(projectRoot, leaseId, reservationId, response, now = Date.now(), key) {
  const hostKey = await approvalKey(key)
  const catalog = await load(projectRoot, hostKey)
  const index = catalog.leases.findIndex((entry) => entry.leaseId === leaseId)
  if (index < 0) throw new Error('Approval lease reservation was not found.')
  const lease = catalog.leases[index]
  if (lease.state !== 'reserved' || lease.reservationId !== reservationId) throw new Error('Approval lease reservation does not match.')
  const leases = catalog.leases.slice()
  leases[index] = signLeaseRecord({
    ...lease,
    state: 'consumed',
    consumedAt: now,
    response: { requestId: response.requestId, status: response.status, revision: response.revision },
  }, hostKey)
  await save(projectRoot, { protocol: PROTOCOL, leases })
}

export function requestDigest(operation, expectedRevision) {
  return createHash('sha256').update(canonical({ expectedRevision, operation })).digest('hex')
}

async function load(projectRoot, suppliedKey) {
  try {
    const parsed = JSON.parse(await readFile(resolve(projectRoot, '.cutout', FILE), 'utf8'))
    if (parsed?.protocol !== PROTOCOL || !Array.isArray(parsed.leases)) throw new Error('Invalid approval lease catalog.')
    const key = await approvalKey(suppliedKey)
    parsed.leases.forEach((lease) => {
      validateLease(lease)
      verifyLease(lease, key)
    })
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
  if (typeof lease.signature !== 'string' || !/^[a-f0-9]{64}$/.test(lease.signature)) throw new Error('Invalid approval lease signature.')
}

function signedLeaseFields(lease) {
  return {
    protocol: lease.protocol,
    leaseId: lease.leaseId,
    approvalId: lease.approvalId,
    subject: lease.subject,
    requestDigest: lease.requestDigest,
    expectedRevision: lease.expectedRevision,
    issuedAt: lease.issuedAt,
    expiresAt: lease.expiresAt,
    state: lease.state,
    reservationId: lease.reservationId ?? null,
    reservedAt: lease.reservedAt ?? null,
    consumedAt: lease.consumedAt ?? null,
    response: lease.response ?? null,
  }
}

function signLease(lease, key) {
  return createHmac('sha256', key).update(canonical(signedLeaseFields(lease))).digest('hex')
}

function signLeaseRecord(lease, key) {
  const { signature: _discarded, ...record } = lease
  return { ...record, signature: signLease(record, key) }
}

function verifyLease(lease, key) {
  const actual = Buffer.from(lease.signature, 'hex')
  const expected = Buffer.from(signLease(lease, key), 'hex')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Approval lease signature is invalid.')
}

async function approvalKey(supplied) {
  if (supplied) {
    const key = Buffer.from(supplied)
    if (key.length < 32) throw new Error('Approval lease host key must contain at least 32 bytes.')
    return key
  }
  const encoded = process.env.CUTOUT_APPROVAL_LEASE_KEY
  if (encoded) {
    const key = Buffer.from(encoded, 'base64')
    if (key.length < 32) throw new Error('CUTOUT_APPROVAL_LEASE_KEY must decode to at least 32 bytes.')
    return key
  }
  await mkdir(resolve(KEY_FILE, '..'), { recursive: true, mode: 0o700 })
  try {
    await writeFile(KEY_FILE, randomBytes(32), { mode: 0o600, flag: 'wx' })
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
  }
  const noFollow = constants.O_NOFOLLOW ?? 0
  const handle = await open(KEY_FILE, constants.O_RDONLY | noFollow)
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) throw new Error('Approval lease host key must be a regular file.')
    if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
      throw new Error('Approval lease host key permissions must be owner-only.')
    }
    const key = await handle.readFile()
    if (key.length < 32) throw new Error('Approval lease host key is invalid.')
    return key
  } finally {
    await handle.close()
  }
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
