import { describe, expect, it } from 'vitest'
import {
  COMMERCE_OPERATOR_MAXIMUM_REQUEST_BYTES,
  COMMERCE_OPERATOR_PROTOCOL,
  COMMERCE_OPERATOR_RESULT_FILES,
  commerceOperatorRequestSchema,
  decodeCommerceOperatorRequestBytes,
} from './operator-protocol'

const jobId = 'job_0123456789abcdef'

describe('closed Commerce operator protocol', () => {
  it('accepts only the fixed six-command envelope and bounded opaque job ids', () => {
    const status = {
      protocol: COMMERCE_OPERATOR_PROTOCOL,
      command: 'status',
      jobId,
    }
    expect(commerceOperatorRequestSchema.parse(status)).toEqual(status)
    expect(decodeCommerceOperatorRequestBytes(new TextEncoder().encode(JSON.stringify(status))))
      .toEqual(status)

    for (const request of [
      { ...status, command: 'provider-invoke' },
      { ...status, projectRoot: '/tmp/project' },
      { ...status, exportPath: '/tmp/result.json' },
      { ...status, jobId: '../not-opaque' },
    ]) {
      expect(() => commerceOperatorRequestSchema.parse(request)).toThrow()
    }
  })

  it('rejects malformed, empty, and oversized standard input before dispatch', () => {
    expect(() => decodeCommerceOperatorRequestBytes(new Uint8Array())).toThrow(/bounded/)
    expect(() => decodeCommerceOperatorRequestBytes(new Uint8Array([0xff]))).toThrow(/UTF-8 JSON/)
    expect(() => decodeCommerceOperatorRequestBytes(
      new Uint8Array(COMMERCE_OPERATOR_MAXIMUM_REQUEST_BYTES + 1),
    )).toThrow(/bounded/)
  })

  it('publishes only fixed Host-owned result filenames', () => {
    expect(COMMERCE_OPERATOR_RESULT_FILES).toEqual({
      preflight: 'preflight.json',
      run: 'pending.json',
      recover: 'pending.json',
      admit: 'admitted.json',
      status: 'status.json',
      cancel: 'status.json',
    })
  })
})
