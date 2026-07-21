import { completeApprovalLease, reserveApprovalLease } from './cutout-approval-leases.mjs'
import { withProjectControlLock } from './cutout-headless-adapter.mjs'

export function createRegistryAdapter(loadService) {
  return {
    registryList: async (root, query) => (await loadService(root)).list(query),
    registryGet: async (root, id, version) => (await loadService(root)).get(id, version),
    registryPlanInstall: async (root, id, framework, version) => (await loadService(root)).planInstall(id, framework, version),
    registryApplyInstall: async (root, id, framework, planId, approvalLeaseId, version) => withProjectControlLock(root, async () => {
      const service = await loadService(root)
      const plan = await service.planInstall(id, framework, version)
      if (plan.id !== planId) throw new Error('Registry install plan changed; preview and approve a new plan.')
      const expectedRevision = await service.currentRevision()
      const operation = { type: 'registry.install', planId, itemId: plan.itemId, itemVersion: plan.itemVersion, targetFramework: plan.targetFramework }
      const reservation = await reserveApprovalLease(root, approvalLeaseId, operation, expectedRevision)
      const receipt = await service.applyInstall(id, framework, planId, reservation.approval.id, version)
      await completeApprovalLease(root, approvalLeaseId, reservation.reservationId, { requestId: planId, status: 'ok', revision: expectedRevision })
      return receipt
    }),
    registryReceipt: async (root, planId) => (await loadService(root)).receipt(planId),
  }
}
