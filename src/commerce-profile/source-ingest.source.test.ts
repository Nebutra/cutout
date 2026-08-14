import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('Commerce source ingest cancellation source contract', () => {
  it('keeps native cancellation identity separate from the signed operation request', async () => {
    const [rendererSource, nativeSource] = await Promise.all([
      readFile(`${root}/src/commerce-profile/source-ingest.ts`, 'utf8'),
      readFile(`${root}/src-tauri/src/commands/ai/commerce_source_ingest.rs`, 'utf8'),
    ])

    expect(rendererSource).toContain("invokeCancellableProxy(\n    'ai_ingest_competition_source_image'")
    expect(rendererSource).toContain('operationRequestId: input.requestId')
    expect(rendererSource).toContain('input.signal')
    expect(nativeSource).toMatch(/request_id:\s*Option<String>[\s\S]*operation_request_id:\s*String/)
    expect(nativeSource).toContain(
      'run_cancellable_proxy_request(&cancellations, request_id, async move {',
    )
    expect(nativeSource).toContain('request_id: operation_request_id')
  })

  it('settles held-out replay only inside the cancellable source future', async () => {
    const nativeSource = await readFile(
      `${root}/src-tauri/src/commands/ai/commerce_source_ingest.rs`,
      'utf8',
    )
    const cancellableStart = nativeSource.indexOf(
      'run_cancellable_proxy_request(&cancellations, request_id, async move {',
    )
    const settlement = nativeSource.indexOf('return settle_held_out_response(', cancellableStart)
    const cancellableEnd = nativeSource.indexOf('\n    })\n    .await', cancellableStart)

    expect(cancellableStart).toBeGreaterThan(-1)
    expect(settlement).toBeGreaterThan(cancellableStart)
    expect(cancellableEnd).toBeGreaterThan(settlement)
  })
})
