import { beforeAll, describe, expect, it, vi } from 'vitest'
import { COMMERCE_SEMANTIC_ROLES } from './profile'
import {
  acceptCommerceProjectLifecycleRecord,
  commerceProjectLifecycleRecordSchema,
  createCommerceProjectLifecycleRecord,
  requestCommerceProjectDownload,
  type CommerceProjectLifecycleRecord,
} from './project-lifecycle'
import {
  commerceProjectDownloadFileNames,
  downloadCommerceProjectFiles,
} from './project-download'
import { createCommerceProjectContractResult } from './project-production.test-fixture'
import type { CommerceProjectProductionResult } from './project-production'

describe('Commerce Project lifecycle (contract evidence only)', () => {
  let result: CommerceProjectProductionResult

  beforeAll(async () => {
    result = await createCommerceProjectContractResult()
  })

  it('binds production to one design revision and requires explicit acceptance', () => {
    const created = createCommerceProjectLifecycleRecord({
      designRevisionId: 'revision:commerce:1',
      result,
    })

    expect(created.review).toBeUndefined()
    expect(created.delivery).toBeUndefined()
    expect(() => requestCommerceProjectDownload(created)).toThrow(
      'Review the Commerce set before requesting delivery.',
    )

    const accepted = acceptCommerceProjectLifecycleRecord(
      created,
      '2026-08-17T00:00:00.000Z',
    )
    expect(accepted.review).toEqual({
      status: 'accepted',
      reviewedAt: '2026-08-17T00:00:00.000Z',
      artifactHashes: result.deliverables.map((deliverable) => deliverable.sha256),
    })
    expect(accepted.delivery).toBeUndefined()
  })

  it('records only a download request and never invents a filesystem receipt', () => {
    const accepted = acceptCommerceProjectLifecycleRecord(
      createCommerceProjectLifecycleRecord({
        designRevisionId: 'revision:commerce:1',
        result,
      }),
      '2026-08-17T00:00:00.000Z',
    )
    const requested = requestCommerceProjectDownload(
      accepted,
      '2026-08-17T00:01:00.000Z',
    )

    expect(requested.delivery).toEqual({
      status: 'download-requested',
      requestedAt: '2026-08-17T00:01:00.000Z',
      artifactHashes: result.deliverables.map((deliverable) => deliverable.sha256),
    })
    expect(requested.delivery).not.toHaveProperty('path')
    expect(requested.delivery).not.toHaveProperty('receipt')
    expect(requested.delivery).not.toHaveProperty('verified')
  })

  it('rejects drift between reviewed hashes and retained ordered artifacts', () => {
    const accepted = acceptCommerceProjectLifecycleRecord(
      createCommerceProjectLifecycleRecord({
        designRevisionId: 'revision:commerce:1',
        result,
      }),
    )
    const drifted = {
      ...accepted,
      review: {
        ...accepted.review!,
        artifactHashes: [...accepted.review!.artifactHashes].reverse(),
      },
    } satisfies CommerceProjectLifecycleRecord

    expect(commerceProjectLifecycleRecordSchema.safeParse(drifted).success).toBe(false)
  })

  it('projects one manifest plus every retained artifact as browser file downloads', () => {
    const names = commerceProjectDownloadFileNames(result)
    expect(names).toHaveLength(COMMERCE_SEMANTIC_ROLES.length + 1)
    expect(names[0]).toMatch(/^commerce-.+-manifest\.json$/)
    expect(names.slice(1)).toEqual(
      result.deliverables.map((deliverable) => deliverable.fileName),
    )

    const downloaded: string[] = []
    const originalCreateObjectUrl = URL.createObjectURL
    const originalRevokeObjectUrl = URL.revokeObjectURL
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:commerce-download'),
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function captureDownload(this: HTMLAnchorElement) {
        downloaded.push(this.download)
      })
    try {
      downloadCommerceProjectFiles(result)
      expect(downloaded).toEqual(names)
    } finally {
      click.mockRestore()
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectUrl,
      })
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectUrl,
      })
    }
  })
})
