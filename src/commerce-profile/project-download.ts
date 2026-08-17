import { base64ToBytes } from '@/lib/image'
import type {
  CommerceProjectDeliverable,
  CommerceProjectProductionResult,
} from './project-production'

function safeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 120)
}

function download(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function downloadDeliverable(deliverable: CommerceProjectDeliverable): void {
  const bytes = base64ToBytes(deliverable.bytesBase64)
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  download(
    deliverable.fileName,
    new Blob([copy.buffer], { type: deliverable.mediaType }),
  )
}

export function commerceProjectDownloadFileNames(
  result: CommerceProjectProductionResult,
): readonly string[] {
  return [
    `commerce-${safeFilePart(result.run.runId)}-manifest.json`,
    ...result.deliverables.map((deliverable) => deliverable.fileName),
  ]
}

export function downloadCommerceProjectFiles(
  result: CommerceProjectProductionResult,
): void {
  const [manifestFileName] = commerceProjectDownloadFileNames(result)
  const manifest = {
    ...result,
    deliverables: result.deliverables.map(
      ({ bytesBase64: _bytes, ...deliverable }) => deliverable,
    ),
  }
  download(
    manifestFileName!,
    new Blob([`${JSON.stringify(manifest, null, 2)}\n`], {
      type: 'application/json;charset=utf-8',
    }),
  )
  result.deliverables.forEach(downloadDeliverable)
}
