import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function normalizeSource(source: string): string {
  return source.replace(/\r\n/gu, '\n')
}

describe('Commerce source ingest cancellation source contract', () => {
  it('keeps native cancellation identity separate from the signed operation request', async () => {
    const [rendererSource, nativeSource] = await Promise.all([
      readFile(`${root}/src/commerce-profile/source-ingest.ts`, 'utf8'),
      readFile(`${root}/src-tauri/src/commands/ai/commerce_source_ingest.rs`, 'utf8'),
    ])

    const renderer = normalizeSource(rendererSource)
    const native = normalizeSource(nativeSource)
    expect(renderer).toContain("invokeCancellableProxy(\n    'ai_ingest_competition_source_image'")
    expect(renderer).toContain('operationRequestId: input.requestId')
    expect(renderer).toContain('input.signal')
    expect(native).toMatch(/request_id:\s*Option<String>[\s\S]*operation_request_id:\s*String/)
    expect(native).toContain(
      'run_cancellable_proxy_request(&cancellations, request_id, async move {',
    )
    expect(native).toContain('request_id: operation_request_id')
  })

  it('settles held-out replay only inside the cancellable source future', async () => {
    const nativeSource = await readFile(
      `${root}/src-tauri/src/commands/ai/commerce_source_ingest.rs`,
      'utf8',
    )
    const native = normalizeSource(nativeSource)
    const cancellableStart = native.indexOf(
      'run_cancellable_proxy_request(&cancellations, request_id, async move {',
    )
    const settlement = native.indexOf('return settle_held_out_response(', cancellableStart)
    const cancellableEnd = native.indexOf('\n    })\n    .await', cancellableStart)

    expect(cancellableStart).toBeGreaterThan(-1)
    expect(settlement).toBeGreaterThan(cancellableStart)
    expect(cancellableEnd).toBeGreaterThan(settlement)
  })
})
