import { useEffect, useRef, useState } from 'react'
import type { PersistedReferenceAttachment } from '@/workspace/workspace-snapshot'
import { blobToBytes, bytesToBlob, isSupportedImage } from '@/lib/image'

export interface ReferenceAttachment extends PersistedReferenceAttachment {
  readonly blob: Blob
  /** `URL.createObjectURL(blob)` - revoked on removal and unmount. */
  readonly url: string
}

interface UseReferenceAttachmentsOptions {
  readonly initialAttachments: readonly PersistedReferenceAttachment[]
  readonly onDesignMarkdownImport: (asset: {
    readonly name: string
    readonly content: string
    readonly importedAt: number
  }) => void
}

/** Manages persisted reference files and the object URLs needed to preview them. */
export function useReferenceAttachments({
  initialAttachments,
  onDesignMarkdownImport,
}: UseReferenceAttachmentsOptions) {
  const [attachments, setAttachments] = useState<readonly ReferenceAttachment[]>(
    () => restoreReferenceAttachments(initialAttachments),
  )
  const attachmentsRef = useRef<readonly ReferenceAttachment[]>(attachments)
  attachmentsRef.current = attachments

  useEffect(
    () => () => {
      for (const attachment of attachmentsRef.current) {
        URL.revokeObjectURL(attachment.url)
      }
    },
    [],
  )

  function onAttachFiles(files: FileList | null): void {
    if (!files) return

    for (const file of Array.from(files)) {
      if (/\.(md|markdown|mdx)$/i.test(file.name)) {
        void file.text().then((content) => {
          onDesignMarkdownImport({
            name: file.name,
            content,
            importedAt: Date.now(),
          })
        })
        continue
      }

      if (!isSupportedImage(file) && !file.type.startsWith('video/')) continue
      void blobToBytes(file).then((bytes) => {
        setAttachments((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            name: file.name,
            bytes,
            mediaType: file.type || 'image/png',
            blob: file,
            url: URL.createObjectURL(file),
          },
        ])
      })
    }
  }

  function removeAttachment(id: string): void {
    setAttachments((current) => {
      const attachment = current.find((item) => item.id === id)
      if (attachment) URL.revokeObjectURL(attachment.url)
      return current.filter((item) => item.id !== id)
    })
  }

  return { attachments, onAttachFiles, removeAttachment }
}

export function restoreReferenceAttachments(
  attachments: readonly PersistedReferenceAttachment[],
): ReferenceAttachment[] {
  return attachments.map((attachment) => {
    const blob = bytesToBlob(attachment.bytes, attachment.mediaType)
    return {
      ...attachment,
      blob,
      url: URL.createObjectURL(blob),
    }
  })
}

export function persistReferenceAttachment(
  attachment: ReferenceAttachment,
): PersistedReferenceAttachment {
  return {
    id: attachment.id,
    name: attachment.name,
    bytes: attachment.bytes,
    mediaType: attachment.mediaType,
  }
}
