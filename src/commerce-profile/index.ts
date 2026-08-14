export * from './catalog'
export * from './benchmark'
export * from './contracts'
export * from './evaluation'
export * from './ingestion'
export * from './inventory'
export * from './held-out'
export * from './normalizer'
export * from './policies'
export type {
  CommerceHeldOutPendingAdmission,
  CommerceHeldOutProductionRunnerInput,
} from './production-runner'
export * from './profile'
export * from './recipes'
export * from './rehearsal'
export * from './source-ingest'
export * from './strategy'

export async function runCommerceHeldOutProduction(
  input: import('./production-runner').CommerceHeldOutProductionRunnerInput,
  host?: import('@/multimodal-host').MultimodalDesktopHost,
): Promise<import('./production-runner').CommerceHeldOutPendingAdmission> {
  const runner = await import('./production-runner')
  return runner.runCommerceHeldOutProduction(input, host)
}
