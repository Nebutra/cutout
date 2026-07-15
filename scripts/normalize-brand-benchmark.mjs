import { chromium } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = '/private/tmp/cutout-brand-benchmark'
const report = JSON.parse(await readFile(join(root, 'report.json'), 'utf8'))
const winner = report.review?.winnerFile
if (!winner) throw new Error('Benchmark report has no selected winner.')
const source = await readFile(join(root, winner))
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  const encoded = await page.evaluate(async ({ base64, size }) => {
    const image = new Image()
    image.src = `data:image/png;base64,${base64}`
    await image.decode()
    const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('Canvas 2D context unavailable.')
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, size, size)
    const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight)
    const width = Math.round(image.naturalWidth * scale); const height = Math.round(image.naturalHeight * scale)
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'
    context.drawImage(image, Math.round((size - width) / 2), Math.round((size - height) / 2), width, height)
    return canvas.toDataURL('image/png').split(',')[1]
  }, { base64: source.toString('base64'), size: 1024 })
  const bytes = Buffer.from(encoded, 'base64'); const sha256 = createHash('sha256').update(bytes).digest('hex')
  const path = join(root, `normalized-winner-${sha256.slice(0, 24)}.png`)
  await writeFile(path, bytes)
  report.normalization = { source: winner, output: path, size: '1024x1024', mediaType: 'image/png', bytes: bytes.byteLength, sha256, method: 'Chromium Canvas decode/re-encode; white background; metadata removed' }
  await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report.normalization))
} finally { await browser.close() }
