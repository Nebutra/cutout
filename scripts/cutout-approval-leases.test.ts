import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  completeApprovalLease,
  issueApprovalLease,
  reserveApprovalLease,
} from './cutout-approval-leases.mjs'

async function project() {
  const root = await mkdtemp(join(tmpdir(), 'cutout-lease-'))
  await mkdir(join(root, '.cutout'))
  return root
}

describe('durable host approval leases', () => {
  const operation = { type: 'export.design-kit', format: 'directory' }
  const key = Buffer.alloc(32, 7)

  it('binds a one-time lease to the exact operation and revision', async () => {
    const root = await project()
    const lease = await issueApprovalLease(root, {
      leaseId: 'lease:one', approvalId: 'approval:one', subject: 'desktop:user',
      operation, expectedRevision: 4, expiresAt: 2_000,
    }, 1_000, key)
    const reserved = await reserveApprovalLease(root, lease.leaseId, operation, 4, 1_500, key)
    expect(reserved.approval).toEqual({ id: 'approval:one', grantedAt: 1_000 })
    await expect(reserveApprovalLease(root, lease.leaseId, operation, 4, 1_501, key)).rejects.toThrow('consumed or reserved')
    await completeApprovalLease(root, lease.leaseId, reserved.reservationId, {
      requestId: 'request:one', status: 'ok', revision: 5,
    }, 1_600, key)
    const catalog = JSON.parse(await readFile(join(root, '.cutout', 'approval-leases.json'), 'utf8'))
    expect(catalog.leases[0]).toMatchObject({ state: 'consumed', response: { requestId: 'request:one', revision: 5 } })
  })

  it('rejects forged, expired, stale and request-mismatched leases', async () => {
    const root = await project()
    await expect(reserveApprovalLease(root, 'forged', operation, 0, 1, key)).rejects.toThrow('not issued')
    const lease = await issueApprovalLease(root, {
      leaseId: 'lease:two', approvalId: 'approval:two', subject: 'desktop:user',
      operation, expectedRevision: 2, expiresAt: 2_000,
    }, 1_000, key)
    await expect(reserveApprovalLease(root, lease.leaseId, operation, 3, 1_500, key)).rejects.toThrow('different project revision')
    await expect(reserveApprovalLease(root, lease.leaseId, { ...operation, format: 'json' }, 2, 1_500, key)).rejects.toThrow('different request')
    await expect(reserveApprovalLease(root, lease.leaseId, operation, 2, 2_000, key)).rejects.toThrow('expired')
  })

  it('rejects a syntactically valid lease injected into the workspace', async () => {
    const root = await project()
    await writeFile(join(root, '.cutout', 'approval-leases.json'), JSON.stringify({
      protocol: 'cutout.approval-lease.v1',
      leases: [{
        protocol: 'cutout.approval-lease.v1', leaseId: 'forged', approvalId: 'approval', subject: 'attacker',
        requestDigest: 'a'.repeat(64), expectedRevision: 0, issuedAt: 1, expiresAt: 2_000, state: 'issued', signature: 'b'.repeat(64),
      }],
    }))
    await expect(reserveApprovalLease(root, 'forged', operation, 0, 1_000, key)).rejects.toThrow('signature')
  })

  it('rejects replay attempts that tamper with a consumed lease state', async () => {
    const root = await project()
    const lease = await issueApprovalLease(root, {
      leaseId: 'lease:consumed', approvalId: 'approval:consumed', subject: 'desktop:user',
      operation, expectedRevision: 1, expiresAt: 3_000,
    }, 1_000, key)
    const reservation = await reserveApprovalLease(root, lease.leaseId, operation, 1, 1_500, key)
    await completeApprovalLease(root, lease.leaseId, reservation.reservationId, {
      requestId: 'request:consumed', status: 'ok', revision: 2,
    }, 1_600, key)
    const path = join(root, '.cutout', 'approval-leases.json')
    const catalog = JSON.parse(await readFile(path, 'utf8'))
    catalog.leases[0].state = 'issued'
    delete catalog.leases[0].reservationId
    delete catalog.leases[0].reservedAt
    delete catalog.leases[0].consumedAt
    delete catalog.leases[0].response
    await writeFile(path, JSON.stringify(catalog))
    await expect(reserveApprovalLease(root, lease.leaseId, operation, 1, 1_700, key)).rejects.toThrow('signature')
  })
})
