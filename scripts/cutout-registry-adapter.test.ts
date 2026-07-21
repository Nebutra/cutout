import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { issueApprovalLease } from './cutout-approval-leases.mjs'
import { createRegistryAdapter } from './cutout-registry-adapter.mjs'

const plan = { id: `install:${'a'.repeat(64)}`, itemId: 'cutout.button', itemVersion: '1.0.0', targetFramework: 'vite-react' }
const operation = { type: 'registry.install', planId: plan.id, itemId: plan.itemId, itemVersion: plan.itemVersion, targetFramework: plan.targetFramework }

describe('registry approval lease adapter', () => {
  it('binds apply to the reviewed plan and consumes the host lease once', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-registry-lease-')); await mkdir(join(root, '.cutout'))
    const applyInstall = vi.fn(async () => ({ planId: plan.id, status: 'succeeded' }))
    const adapter = createRegistryAdapter(async () => ({ planInstall: async () => plan, currentRevision: async () => 3, applyInstall }))
    try {
      const lease = await issueApprovalLease(root, { approvalId: 'reviewed-install', subject: 'desktop-host', operation, expectedRevision: 3, expiresAt: Date.now() + 60_000 })
      await expect(adapter.registryApplyInstall(root, plan.itemId, plan.targetFramework, plan.id, lease.leaseId)).resolves.toMatchObject({ status: 'succeeded' })
      expect(applyInstall).toHaveBeenCalledWith(plan.itemId, plan.targetFramework, plan.id, 'reviewed-install', undefined)
      await expect(adapter.registryApplyInstall(root, plan.itemId, plan.targetFramework, plan.id, lease.leaseId)).rejects.toThrow('consumed or reserved')
      expect(applyInstall).toHaveBeenCalledTimes(1)
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('rejects a changed plan before reserving authority or writing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-registry-plan-')); await mkdir(join(root, '.cutout'))
    const applyInstall = vi.fn()
    const adapter = createRegistryAdapter(async () => ({ planInstall: async () => plan, currentRevision: async () => 3, applyInstall }))
    try {
      await expect(adapter.registryApplyInstall(root, plan.itemId, plan.targetFramework, 'install:stale', 'forged')).rejects.toThrow('plan changed')
      expect(applyInstall).not.toHaveBeenCalled()
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('rejects a forged lease before writing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-registry-forged-')); await mkdir(join(root, '.cutout'))
    const applyInstall = vi.fn()
    const adapter = createRegistryAdapter(async () => ({ planInstall: async () => plan, currentRevision: async () => 3, applyInstall }))
    try {
      await expect(adapter.registryApplyInstall(root, plan.itemId, plan.targetFramework, plan.id, 'forged')).rejects.toThrow('not issued by this Cutout host')
      expect(applyInstall).not.toHaveBeenCalled()
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('rejects an expired lease before writing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-registry-expired-')); await mkdir(join(root, '.cutout'))
    const applyInstall = vi.fn()
    const adapter = createRegistryAdapter(async () => ({ planInstall: async () => plan, currentRevision: async () => 3, applyInstall }))
    try {
      const lease = await issueApprovalLease(root, {
        approvalId: 'expired-install', subject: 'desktop-host', operation, expectedRevision: 3, expiresAt: 2_000,
      }, 1_000)
      await expect(adapter.registryApplyInstall(root, plan.itemId, plan.targetFramework, plan.id, lease.leaseId)).rejects.toThrow('expired')
      expect(applyInstall).not.toHaveBeenCalled()
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('rejects leases issued for another project revision or registry operation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cutout-registry-mismatch-')); await mkdir(join(root, '.cutout'))
    const applyInstall = vi.fn()
    const adapter = createRegistryAdapter(async () => ({ planInstall: async () => plan, currentRevision: async () => 3, applyInstall }))
    try {
      const staleRevision = await issueApprovalLease(root, {
        approvalId: 'stale-install', subject: 'desktop-host', operation, expectedRevision: 2, expiresAt: Date.now() + 60_000,
      })
      await expect(adapter.registryApplyInstall(root, plan.itemId, plan.targetFramework, plan.id, staleRevision.leaseId)).rejects.toThrow('different project revision')

      const differentOperation = await issueApprovalLease(root, {
        approvalId: 'other-install',
        subject: 'desktop-host',
        operation: { ...operation, targetFramework: 'next-app-router' },
        expectedRevision: 3,
        expiresAt: Date.now() + 60_000,
      })
      await expect(adapter.registryApplyInstall(root, plan.itemId, plan.targetFramework, plan.id, differentOperation.leaseId)).rejects.toThrow('different request')
      expect(applyInstall).not.toHaveBeenCalled()
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
