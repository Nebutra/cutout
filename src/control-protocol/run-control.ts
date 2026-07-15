import {
  CONTROL_PROTOCOL_VERSION,
  type ControlOperation,
  type ControlRequest,
  type ControlResponse,
} from './control-protocol'

export interface RunControlTransport {
  execute(request: ControlRequest): Promise<ControlResponse>
}

export interface RunControlClient {
  readonly revision: number
  start(input: { readonly runId: string; readonly mode: 'create' | 'repair'; readonly intent: string }): Promise<ControlResponse>
  get(runId: string): Promise<ControlResponse>
  events(runId: string, options?: { readonly afterEventId?: string; readonly limit?: number }): Promise<ControlResponse>
  cancel(runId: string, reason?: string): Promise<ControlResponse>
}

/**
 * Transport-neutral adapter for GUI, CLI hosts, and tests. It owns no run
 * state: the host remains authoritative and every method uses cutout.control.v1.
 */
export function createRunControlClient(
  transport: RunControlTransport,
  options: { readonly initialRevision?: number; readonly createRequestId?: () => string } = {},
): RunControlClient {
  let revision = options.initialRevision ?? 0
  const createRequestId = options.createRequestId ?? (() => crypto.randomUUID())

  const execute = async (operation: ControlOperation) => {
    const response = await transport.execute({
      protocol: CONTROL_PROTOCOL_VERSION,
      requestId: createRequestId(),
      expectedRevision: revision,
      mode: 'apply',
      operation,
    })
    revision = response.revision
    return response
  }

  return {
    get revision() { return revision },
    start: (input) => execute({ type: 'run.start', ...input }),
    get: (runId) => execute({ type: 'run.get', runId }),
    events: (runId, eventOptions = {}) => execute({ type: 'run.events', runId, ...eventOptions }),
    cancel: (runId, reason) => execute({ type: 'run.cancel', runId, ...(reason ? { reason } : {}) }),
  }
}
