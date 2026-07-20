import { mkdtemp, mkdir, readFile } from 'node:fs/promises'
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

  it('binds a one-time lease to the exact operation and revision', async () => {
    const root = await project()
    const lease = await issueApprovalLease(root, {
      leaseId: 'lease:one', approvalId: 'approval:one', subject: 'desktop:user',
      operation, expectedRevision: 4, expiresAt: 2_000,
    }, 1_000)
    const reserved = await reserveApprovalLease(root, lease.leaseId, operation, 4, 1_500)
    expect(reserved.approval).toEqual({ id: 'approval:one', grantedAt: 1_000 })
    await expect(reserveApprovalLease(root, lease.leaseId, operation, 4, 1_501)).rejects.toThrow('consumed or reserved')
    await completeApprovalLease(root, lease.leaseId, reserved.reservationId, {
      requestId: 'request:one', status: 'ok', revision: 5,
    }, 1_600)
    const catalog = JSON.parse(await readFile(join(root, '.cutout', 'approval-leases.json'), 'utf8'))
    expect(catalog.leases[0]).toMatchObject({ state: 'consumed', response: { requestId: 'request:one', revision: 5 } })
  })

  it('rejects forged, expired, stale and request-mismatched leases', async () => {
    const root = await project()
    await expect(reserveApprovalLease(root, 'forged', operation, 0, 1)).rejects.toThrow('not issued')
    const lease = await issueApprovalLease(root, {
      leaseId: 'lease:two', approvalId: 'approval:two', subject: 'desktop:user',
      operation, expectedRevision: 2, expiresAt: 2_000,
    }, 1_000)
    await expect(reserveApprovalLease(root, lease.leaseId, operation, 3, 1_500)).rejects.toThrow('different project revision')
    await expect(reserveApprovalLease(root, lease.leaseId, { ...operation, format: 'json' }, 2, 1_500)).rejects.toThrow('different request')
    await expect(reserveApprovalLease(root, lease.leaseId, operation, 2, 2_000)).rejects.toThrow('expired')
  })
})
