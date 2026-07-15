import { describe, expect, it } from 'vitest'
import { createRunControlClient } from './run-control'
import type { ControlRequest, ControlResponse } from './control-protocol'

describe('shared run control client', () => {
  it('uses one protocol and carries the authoritative revision across GUI-safe calls', async () => {
    const requests: ControlRequest[] = []
    const revisions = [1, 1, 1, 2]
    const client = createRunControlClient({
      async execute(request) {
        requests.push(request)
        return {
          protocol: 'cutout.control.v1', requestId: request.requestId, status: 'ok',
          revision: revisions[requests.length - 1] ?? 2, dryRun: false, idempotent: false,
        } satisfies ControlResponse
      },
    }, { createRequestId: () => `request-${requests.length + 1}` })

    await client.start({ runId: 'run-1', mode: 'create', intent: 'Build it.' })
    await client.get('run-1')
    await client.events('run-1', { afterEventId: 'event-1', limit: 50 })
    await client.cancel('run-1', 'Changed direction.')

    expect(requests.map(({ protocol, expectedRevision, operation }) => ({ protocol, expectedRevision, operation }))).toEqual([
      { protocol: 'cutout.control.v1', expectedRevision: 0, operation: { type: 'run.start', runId: 'run-1', mode: 'create', intent: 'Build it.' } },
      { protocol: 'cutout.control.v1', expectedRevision: 1, operation: { type: 'run.get', runId: 'run-1' } },
      { protocol: 'cutout.control.v1', expectedRevision: 1, operation: { type: 'run.events', runId: 'run-1', afterEventId: 'event-1', limit: 50 } },
      { protocol: 'cutout.control.v1', expectedRevision: 1, operation: { type: 'run.cancel', runId: 'run-1', reason: 'Changed direction.' } },
    ])
    expect(client.revision).toBe(2)
  })
})
