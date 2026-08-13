import { forEachConcurrent } from '@/lib/async-pool'
import { err, isErr, type Result } from '@/services/types'

export interface DistinctSuiteTopologyOutcome<Request, Plan> {
  readonly request: Request
  readonly result: Result<Plan>
  readonly repairedDuplicate: boolean
}

export async function planDistinctSuiteTopologies<Request, Plan>(input: {
  readonly requests: readonly Request[]
  readonly concurrency: number
  readonly priorFingerprints: readonly string[]
  readonly plan: (
    request: Request,
    priorFingerprints: readonly string[],
  ) => Promise<Result<Plan>>
  readonly fingerprint: (plan: Plan) => string
}): Promise<readonly DistinctSuiteTopologyOutcome<Request, Plan>[]> {
  const baseline = [...input.priorFingerprints]
  const initial = Array<Result<Plan> | undefined>(input.requests.length)
  await forEachConcurrent(input.requests, input.concurrency, async (request, index) => {
    initial[index] = await input.plan(request, baseline)
  })

  const accepted = [...baseline]
  const outcomes: DistinctSuiteTopologyOutcome<Request, Plan>[] = []
  for (const [index, request] of input.requests.entries()) {
    const first = initial[index]
    if (!first) throw new Error('Suite topology planning did not settle every request.')
    let result = first
    let repairedDuplicate = false
    if (!isErr(result) && accepted.includes(input.fingerprint(result.data))) {
      repairedDuplicate = true
      result = await input.plan(request, accepted)
    }
    if (!isErr(result)) {
      const fingerprint = input.fingerprint(result.data)
      if (accepted.includes(fingerprint)) {
        result = err('The planned prototype suite duplicates an existing route graph.')
      } else {
        accepted.push(fingerprint)
      }
    }
    outcomes.push({ request, result, repairedDuplicate })
  }
  return outcomes
}
