import {
  CONNECTOR_PROTOCOL,
  type Connector,
  type ConnectorError,
  type ConnectorOperation,
  type ConnectorResult,
  type ConnectorRunRequest,
  type ConnectorPreview,
  type ConnectorImport,
  type ConnectorExport,
  type ConnectorInput,
  type ConnectorContext,
} from './contracts'

type RunOutput = ConnectorPreview | ConnectorImport | ConnectorExport

export class ConnectorRegistry {
  readonly #connectors = new Map<string, Connector>()

  register(connector: Connector): ConnectorResult<Connector> {
    const id = connector.manifest.id
    if (this.#connectors.has(id)) return failure('duplicate-connector', `Connector already registered: ${id}`)
    this.#connectors.set(id, connector)
    return success(connector)
  }

  get(id: string): Connector | undefined {
    return this.#connectors.get(id)
  }

  list(): readonly Connector[] {
    return [...this.#connectors.values()]
  }

  negotiate(operation: ConnectorOperation, sourceKind: ConnectorRunRequest['input']['sourceKind']): readonly Connector[] {
    return this.list().filter(({ manifest }) => manifest.capabilities.some((capability) =>
      capability.operation === operation && capability.sourceKinds.includes(sourceKind),
    ))
  }

  async run(request: ConnectorRunRequest): Promise<ConnectorResult<RunOutput>> {
    const connector = this.get(request.connectorId)
    if (!connector) return failure('connector-not-found', `Connector not found: ${request.connectorId}`)
    const { manifest } = connector
    if (manifest.protocol !== CONNECTOR_PROTOCOL) return failure('invalid-result', 'Unsupported connector protocol.')
    if (request.base.documentId !== request.current.documentId
      || request.base.revisionId !== request.current.revisionId
      || request.base.revisionNumber !== request.current.revisionNumber) {
      return failure('stale-revision', 'Connector request targets a stale DesignDocument revision.')
    }
    const capability = manifest.capabilities.some((entry) =>
      entry.operation === request.operation && entry.sourceKinds.includes(request.input.sourceKind),
    )
    const method = connector[request.operation]
    if (!capability || typeof method !== 'function') {
      return failure('capability-mismatch', `${manifest.id} cannot ${request.operation} ${request.input.sourceKind}.`)
    }
    if (manifest.availability === 'unavailable') {
      return failure('unavailable', manifest.unavailableReason ?? `${manifest.name} is unavailable.`)
    }
    if (manifest.availability === 'authorization-required' && !hasAuth(request.auth)) {
      return failure('authorization-required', `${manifest.name} requires ${manifest.auth.kind} authorization.`)
    }
    const signal = request.signal ?? new AbortController().signal
    if (signal.aborted) return failure('aborted', 'Connector operation was aborted.')
    try {
      const invoke = method as (
        input: ConnectorInput,
        context: ConnectorContext,
      ) => Promise<ConnectorResult<RunOutput>>
      const result = await invoke.call(connector, request.input, {
        base: request.base,
        now: () => new Date().toISOString(),
        signal,
        auth: request.auth,
      })
      if (signal.aborted) return failure('aborted', 'Connector operation was aborted.')
      return sanitizeResult(result, request.auth)
    } catch (error) {
      if (signal.aborted || isAbortError(error)) return failure('aborted', 'Connector operation was aborted.')
      return failure(
        'connector-failed',
        redactKnownSecrets(
          redact(String(error instanceof Error ? error.message : error)),
          request.auth,
        ),
      )
    }
  }
}

function sanitizeResult(
  result: ConnectorResult<RunOutput>,
  auth: Readonly<Record<string, string>> | undefined,
): ConnectorResult<RunOutput> {
  if (!result.ok) {
    return {
      ok: false,
      error: {
        ...result.error,
        message: redactKnownSecrets(redact(result.error.message), auth),
      },
    }
  }
  const serialized = JSON.stringify(result.data)
  if (containsSecret(serialized) || containsKnownSecret(serialized, auth)) {
    return failure('invalid-result', 'Connector result contained credential-shaped data and was rejected.')
  }
  return result
}

function hasAuth(auth: Readonly<Record<string, string>> | undefined): boolean {
  return Boolean(auth && Object.values(auth).some((value) => value.trim().length > 0))
}

const CREDENTIAL = /(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+\b|(?:api[-_]?key|token|secret|authorization)\s*[:=]\s*[^\s,;]+)/gi

export function redact(value: string): string {
  return value.replace(CREDENTIAL, '[REDACTED]')
}

function containsSecret(value: string): boolean {
  CREDENTIAL.lastIndex = 0
  return CREDENTIAL.test(value)
}

function containsKnownSecret(
  serialized: string,
  auth: Readonly<Record<string, string>> | undefined,
): boolean {
  return authValues(auth).some((secret) => serialized.includes(jsonStringContent(secret)))
}

function redactKnownSecrets(
  value: string,
  auth: Readonly<Record<string, string>> | undefined,
): string {
  return authValues(auth).reduce(
    (message, secret) => message.replaceAll(secret, '[REDACTED]'),
    value,
  )
}

function authValues(auth: Readonly<Record<string, string>> | undefined): string[] {
  return [...new Set(Object.values(auth ?? {}).map((value) => value.trim()).filter(Boolean))]
}

function jsonStringContent(value: string): string {
  return JSON.stringify(value).slice(1, -1)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function success<T>(data: T): ConnectorResult<T> { return { ok: true, data } }
function failure<T = never>(code: ConnectorError['code'], message: string): ConnectorResult<T> {
  return { ok: false, error: { code, message } }
}
