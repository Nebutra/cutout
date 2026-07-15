/**
 * Real verification that the exact image requests the app builds are accepted
 * by a live gateway and return usable PNG bytes — the "generation actually
 * produces images" leaf of "can it deliver". Exercises the gateway-backed
 * service's `generateImages` (POST /images/generations) and `editImage`
 * (multipart POST /images/edits), which are byte-identical to what the Rust
 * `ai_proxy_request`/`ai_image_edit` commands send.
 *
 * Gated behind CUTOUT_RUN_PIPELINE_BENCHMARK=1 (real image generation, real
 * spend — a few cents per run); requires MOX_API_KEY + MOX_BASE_URL.
 */
import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { isErr } from '@/services/types'
import {
  apiBase,
  createGatewayGenerationService,
  GATEWAY_IMAGE_MODEL,
  GATEWAY_PROVIDER_ID,
} from './gateway-generation.testkit'

const RUN = process.env.CUTOUT_RUN_PIPELINE_BENCHMARK === '1'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required.`)
  return value
}

/** A minimal but valid opaque RGB PNG to serve as a 垫图 reference. */
function solidPng(size: number, r: number, g: number, b: number): Uint8Array {
  const crc32 = (buf: Buffer): number => {
    let c = ~0
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i]!
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
    }
    return ~c >>> 0
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2 // RGB
  const raw = Buffer.alloc(size * (1 + size * 3))
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 3)] = 0
    for (let x = 0; x < size; x++) {
      const o = y * (1 + size * 3) + 1 + x * 3
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
    }
  }
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
  return new Uint8Array(png)
}

describe.skipIf(!RUN)('gateway image generation', () => {
  const generation = RUN
    ? createGatewayGenerationService(required('MOX_API_KEY'), apiBase(required('MOX_BASE_URL')))
    : null

  it('generateImages returns real PNG bytes', { timeout: 120_000 }, async () => {
    const result = await generation!.generateImages({
      providerId: GATEWAY_PROVIDER_ID,
      model: GATEWAY_IMAGE_MODEL,
      prompt: 'a minimal flat-design mobile app login screen mockup, neutral palette',
    })
    expect(isErr(result)).toBe(false)
    if (isErr(result)) throw new Error(result.error)
    expect(result.data.length).toBeGreaterThan(0)
    const asset = result.data[0]!
    expect(asset.mediaType).toMatch(/^image\//)
    expect(asset.bytes.length).toBeGreaterThan(1000)
    // Real PNG magic bytes.
    expect(Array.from(asset.bytes.slice(0, 4))).toEqual([137, 80, 78, 71])
  })

  it('editImage (垫图) returns real PNG bytes from a reference', { timeout: 120_000 }, async () => {
    const result = await generation!.editImage({
      providerId: GATEWAY_PROVIDER_ID,
      model: GATEWAY_IMAGE_MODEL,
      prompt: 'add a thin darker border and a small centered button',
      images: [solidPng(64, 200, 200, 210)],
      inputFidelity: 'high',
    })
    expect(isErr(result)).toBe(false)
    if (isErr(result)) throw new Error(result.error)
    expect(result.data.length).toBeGreaterThan(0)
    const asset = result.data[0]!
    expect(asset.bytes.length).toBeGreaterThan(1000)
    expect(Array.from(asset.bytes.slice(0, 4))).toEqual([137, 80, 78, 71])
  })
})
