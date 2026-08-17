export * from './catalog'
export * from './benchmark'
export * from './contracts'
export * from './evaluation'
export * from './ingestion'
export * from './inventory'
export * from './held-out'
export * from './normalizer'
export * from './policies'
export * from './project-production'
export * from './project-lifecycle'
export * from './project-download'
export type {
  CommerceHeldOutPendingAdmission,
  CommerceHeldOutProductionRunnerInput,
} from './production-runner'
export type { CommerceProductionCoreHost, CommerceProductionHost } from './production-host'
export * from './operator-protocol'
export * from './operator-host'
export * from './profile'
export * from './recipes'
export * from './rehearsal'
export * from './source-ingest'
export * from './strategy'

export async function runCommerceHeldOutProduction(
  input: import('./production-runner').CommerceHeldOutProductionRunnerInput,
  host?: import('./production-host').CommerceProductionHost,
): Promise<import('./production-runner').CommerceHeldOutPendingAdmission> {
  const runner = await import('./production-runner')
  return runner.runCommerceHeldOutProduction(input, host)
}
