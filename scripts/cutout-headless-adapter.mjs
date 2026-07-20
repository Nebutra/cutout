import { randomUUID } from 'node:crypto'
import { mkdir, rmdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { completeApprovalLease, reserveApprovalLease } from './cutout-approval-leases.mjs'

export const PROTOCOL = 'cutout.control.v1'

const SAFE_OPERATIONS = new Set([
  'project.context',
  'material.list',
  'validate',
  'design.patch',
  'tokens.patch',
  'source.ingest',
  'run.start',
  'run.get',
  'run.events',
  'run.cancel',
  'export.design-kit',
  'export.brand-kit',
  'export.starter',
  'coding.execute',
  'coding.review',
  'coding.repair',
])

const APPROVAL_LEASE_OPERATIONS = new Set([
  'source.ingest',
  'export.design-kit',
  'export.brand-kit',
  'export.starter',
  'coding.execute',
  'coding.review',
  'coding.repair',
])

export function createHeadlessAdapter(loadRuntime) {
  return {
    async executeControl(projectRoot, operation, { mode = 'apply', requestId = randomUUID(), approvalLeaseId } = {}) {
      if (!SAFE_OPERATIONS.has(operation?.type)) {
        return unsupported(`Operation "${String(operation?.type ?? 'unknown')}"`)
      }

      try {
        return await withProjectControlLock(projectRoot, async () => {
          const runtime = await loadRuntime()
          const store = runtime.createNodeFsRuntimeStore(resolve(projectRoot))
          const state = await store.load()
          const expectedRevision = state.ledger?.revision ?? 0
          const reservation = mode === 'apply' && APPROVAL_LEASE_OPERATIONS.has(operation.type)
            ? await reserveApprovalLease(projectRoot, approvalLeaseId, operation, expectedRevision)
            : undefined
          const response = await runtime.createHeadlessRuntime(store).execute({
            protocol: PROTOCOL,
            requestId,
            expectedRevision,
            mode,
            operation,
          }, reservation ? { approval: reservation.approval } : undefined)
          if (reservation) await completeApprovalLease(projectRoot, approvalLeaseId, reservation.reservationId, response)
          return { ok: response.status === 'ok', response }
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The headless runtime could not load the project state.'
        return adapterError('runtime-unavailable', sanitizeMessage(message))
      }
    },

    async executeGovernance(projectRoot, input, policy, mode = 'validate') {
      if (!['preview', 'validate', 'report'].includes(mode)) {
        return adapterError('invalid-governance-mode', 'Governance mode must be preview, validate, or report.')
      }
      try {
        const runtime = await loadRuntime()
        const state = await runtime.createNodeFsRuntimeStore(resolve(projectRoot)).load()
        if (!input || typeof input !== 'object' || Array.isArray(input) || !policy || typeof policy !== 'object' || Array.isArray(policy)) {
          return adapterError('invalid-governance-input', 'Governance input and policy must be structured objects.')
        }
        if (input.documentId !== state.design.meta.id || input.revisionId !== state.design.revision.id) {
          return adapterError('stale-governance-input', 'Governance evidence must match the bound Design IR document and revision.')
        }
        return { ok: true, response: await runtime.runHeadlessGovernance(input, policy, mode) }
      } catch (error) {
        return adapterError('governance-invalid', sanitizeMessage(error instanceof Error ? error.message : 'The governance harness rejected the evidence.'))
      }
    },
  }
}

export function adapterError(code, message) {
  return { ok: false, error: { code, message } }
}

export function unsupported(operation) {
  return adapterError(
    'unsupported-operation',
    `${operation} is not available in the headless v1 runtime. It has not performed any file, network, provider, or paid action.`,
  )
}

async function withProjectControlLock(projectRoot, action) {
  const lock = resolve(projectRoot, '.cutout', '.external-control.lock')
  const deadline = Date.now() + 10_000
  while (true) {
    try {
      await mkdir(lock)
      break
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      const info = await stat(lock).catch(() => null)
      if (info && Date.now() - info.mtimeMs > 30_000) await rmdir(lock).catch(() => undefined)
      if (Date.now() >= deadline) throw new Error('Cutout project is busy; retry the control operation.')
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 20))
    }
  }
  try {
    return await action()
  } finally {
    await rmdir(lock).catch(() => undefined)
  }
}

function sanitizeMessage(message) {
  return message
    .replace(/(?:\/Users\/|\/home\/|[A-Z]:\\)[^\s)]+/g, '<local-path>')
    .replace(/(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+)/gi, '<redacted>')
    .slice(0, 1200)
}

export function parseTokenAssignments(values) {
  if (values.length === 0) throw new Error('At least one token=value assignment is required.')
  return values.map((assignment) => {
    const separator = assignment.indexOf('=')
    if (separator <= 0) throw new Error(`Expected token=value, received "${assignment}".`)
    const token = assignment.slice(0, separator)
    const raw = assignment.slice(separator + 1)
    if (raw.length === 0) throw new Error(`Token "${token}" has an empty value.`)
    const number = Number(raw)
    return { token, value: Number.isFinite(number) && /^-?(?:\d+|\d*\.\d+)$/.test(raw) ? number : raw }
  })
}
