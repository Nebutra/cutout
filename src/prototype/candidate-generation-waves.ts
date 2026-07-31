export interface CandidateGenerationAttempt {
  readonly candidateId: string
  readonly attempt: number
  readonly identity: string
}

export interface CandidateGenerationFailure {
  readonly message: string
  readonly routeWide: boolean
  readonly transient: boolean
}

export type CandidateGenerationOutcome<Value> =
  | {
      readonly candidateId: string
      readonly status: 'ready'
      readonly attempts: number
      readonly value: Value
    }
  | {
      readonly candidateId: string
      readonly status: 'failed'
      readonly attempts: number
      readonly failure: CandidateGenerationFailure
    }

export interface CandidateGenerationWaveResult<Value> {
  readonly outcomes: readonly CandidateGenerationOutcome<Value>[]
  readonly complete: boolean
  readonly routeUnavailable: boolean
}

type MaybePromise = void | Promise<void>

export async function runCandidateGenerationWaves<Value>(input: {
  readonly candidateIds: readonly string[]
  readonly concurrency: number
  readonly maxTransientRetries: number
  readonly generate: (attempt: CandidateGenerationAttempt) => Promise<Value>
  readonly classifyFailure: (error: unknown) => CandidateGenerationFailure
  readonly isCancelled: (error: unknown) => boolean
  readonly onAttemptStart?: (attempt: CandidateGenerationAttempt) => MaybePromise
  readonly onReady?: (
    attempt: CandidateGenerationAttempt,
    value: Value,
  ) => MaybePromise
  readonly onFailed?: (
    attempt: CandidateGenerationAttempt,
    failure: CandidateGenerationFailure,
  ) => MaybePromise
  readonly onCancelled?: (attempt: CandidateGenerationAttempt) => MaybePromise
}): Promise<CandidateGenerationWaveResult<Value>> {
  if (!Number.isInteger(input.concurrency) || input.concurrency < 1) {
    throw new Error('Candidate generation concurrency must be a positive integer.')
  }
  if (!Number.isInteger(input.maxTransientRetries) || input.maxTransientRetries < 0) {
    throw new Error('Candidate generation retries must be a non-negative integer.')
  }

  const outcomes: CandidateGenerationOutcome<Value>[] = []
  let routeProvenUsable = false
  let routeUnavailable = false

  const runCandidate = async (
    candidateId: string,
  ): Promise<CandidateGenerationOutcome<Value>> => {
    for (let attempt = 1; ; attempt += 1) {
      const identity = attempt === 1
        ? candidateId
        : `${candidateId}:retry:${attempt - 1}`
      const candidateAttempt = { candidateId, attempt, identity }
      await input.onAttemptStart?.(candidateAttempt)
      try {
        const value = await input.generate(candidateAttempt)
        await input.onReady?.(candidateAttempt, value)
        return { candidateId, status: 'ready', attempts: attempt, value }
      } catch (error) {
        if (input.isCancelled(error)) {
          await input.onCancelled?.(candidateAttempt)
          throw error
        }
        const failure = input.classifyFailure(error)
        if (failure.transient && attempt <= input.maxTransientRetries) continue
        await input.onFailed?.(candidateAttempt, failure)
        return { candidateId, status: 'failed', attempts: attempt, failure }
      }
    }
  }

  for (let cursor = 0; cursor < input.candidateIds.length; cursor += input.concurrency) {
    const waveIds = input.candidateIds.slice(cursor, cursor + input.concurrency)
    const settled = await Promise.allSettled(waveIds.map(runCandidate))
    const waveOutcomes: CandidateGenerationOutcome<Value>[] = []
    for (const result of settled) {
      if (result.status === 'rejected') throw result.reason
      waveOutcomes.push(result.value)
    }
    outcomes.push(...waveOutcomes)
    if (waveOutcomes.some((outcome) => outcome.status === 'ready')) {
      routeProvenUsable = true
    }
    if (
      !routeProvenUsable &&
      waveOutcomes.length > 0 &&
      waveOutcomes.every(
        (outcome) => outcome.status === 'failed' && outcome.failure.routeWide,
      )
    ) {
      routeUnavailable = true
      break
    }
  }

  return {
    outcomes,
    complete:
      outcomes.length === input.candidateIds.length &&
      outcomes.every((outcome) => outcome.status === 'ready'),
    routeUnavailable,
  }
}
