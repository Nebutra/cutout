import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const enabled = process.env.CUTOUT_RUN_PROVIDER_SMOKE === '1'
if (!enabled) {
  console.log('Provider smoke skipped. Set CUTOUT_RUN_PROVIDER_SMOKE=1 to run one bounded image generation.')
  process.exit(0)
}

const key = process.env.MOX_API_KEY
const configuredBase = process.env.MOX_BASE_URL
if (!key || !configuredBase) throw new Error('MOX_API_KEY and MOX_BASE_URL are required.')

const parsed = new URL(configuredBase)
if (!parsed.pathname || parsed.pathname === '/') parsed.pathname = '/v1'
const base = parsed.toString().replace(/\/$/, '')
const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 90_000)
const startedAt = Date.now()

try {
  const response = await fetch(`${base}/images/generations`, {
    method: 'POST',
    signal: controller.signal,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-image-2',
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json',
      prompt: 'Create one clean brand visual foundation board: a precise black geometric mark, white field, one cyan accent, generous clear space, no text, no mockup, no gradients. Production-ready flat graphic.',
    }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(`Provider smoke failed with HTTP ${response.status}.`)
  const item = payload?.data?.[0]
  let bytes
  if (typeof item?.b64_json === 'string') bytes = Buffer.from(item.b64_json, 'base64')
  else if (typeof item?.url === 'string') {
    const assetResponse = await fetch(item.url, { signal: controller.signal })
    if (!assetResponse.ok) throw new Error(`Provider asset download failed with HTTP ${assetResponse.status}.`)
    bytes = Buffer.from(await assetResponse.arrayBuffer())
  } else throw new Error('Provider smoke returned no image payload.')

  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const outputDirectory = join(tmpdir(), 'cutout-provider-smoke')
  await mkdir(outputDirectory, { recursive: true })
  const imagePath = join(outputDirectory, `foundation-${sha256.slice(0, 16)}.png`)
  const receiptPath = join(outputDirectory, `receipt-${sha256.slice(0, 16)}.json`)
  await writeFile(imagePath, bytes)
  await writeFile(receiptPath, JSON.stringify({
    version: 'cutout.provider-smoke-receipt.v1',
    provider: 'mox-openai-compatible',
    model: 'gpt-image-2',
    variants: 1,
    sha256,
    bytes: bytes.byteLength,
    startedAt,
    completedAt: Date.now(),
    imagePath,
  }, null, 2))
  console.log(JSON.stringify({ status: 'succeeded', model: 'gpt-image-2', sha256, bytes: bytes.byteLength, imagePath, receiptPath }))
} finally {
  clearTimeout(timeout)
}
