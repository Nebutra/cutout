export function createRegistryAdapter(loadService) {
  return {
    registryList: async (root, query) => (await loadService(root)).list(query),
    registryGet: async (root, id, version) => (await loadService(root)).get(id, version),
    registryPlanInstall: async (root, id, framework, version) => (await loadService(root)).planInstall(id, framework, version),
    registryApplyInstall: async (root, id, framework, approval, version) => (await loadService(root)).applyInstall(id, framework, approval, version),
    registryReceipt: async (root, planId) => (await loadService(root)).receipt(planId),
  }
}
