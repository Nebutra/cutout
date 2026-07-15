import type { IntegrationAdapter, IntegrationOperation, IntegrationRequest } from './contracts'
import { IntegrationRegistry, validateManifest } from './registry'

export interface ConformanceCase {
  readonly name: string
  readonly passed: boolean
  readonly detail?: string
}

export async function runAdapterConformance(
  adapter: IntegrationAdapter,
  requestFor: (operation: IntegrationOperation) => IntegrationRequest,
): Promise<readonly ConformanceCase[]> {
  const manifestIssue = validateManifest(adapter)
  const cases: ConformanceCase[] = [{ name: 'valid manifest', passed: manifestIssue === null, ...(manifestIssue ? { detail: manifestIssue } : {}) }]
  const registry = new IntegrationRegistry()
  const registration = registry.register(adapter)
  cases.push({ name: 'registry registration', passed: registration.ok, ...(!registration.ok ? { detail: registration.error.message } : {}) })
  if (!registration.ok) return cases
  for (const capability of adapter.manifest.capabilities) {
    const request = requestFor(capability.operation)
    const result = await registry.run(adapter.manifest.id, request)
    cases.push({ name: `${capability.operation} contract`, passed: result.ok, ...(!result.ok ? { detail: result.error.message } : {}) })
  }
  return cases
}

export function assertAdapterConformance(cases: readonly ConformanceCase[]): void {
  const failures = cases.filter((item) => !item.passed)
  if (failures.length) throw new Error(failures.map((item) => `${item.name}: ${item.detail ?? 'failed'}`).join('\n'))
}
