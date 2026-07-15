/**
 * Image import glue (spec §6 step 1).
 *
 * Bridges a picked/dropped `File` into the store: decode → `loadImage`. Shared
 * by the DropZone, the TopBar import button, and the ⌘O hotkey so the decode +
 * error-toast policy lives in one place. Also owns the hidden file-picker.
 */
import { useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useLingui } from '@lingui/react/macro'
import { useStore } from '@/store'
import { decodeImage, isSupportedImage, baseName } from '@/lib/image'
import {
  isDesignMarkdownFileName,
  normalizedDesignMarkdown,
} from '@/prototype/design-md'

export interface ImageImport {
  /** Decode + load a single file (rejects unsupported types with a toast). */
  importFile(file: File): Promise<void>
  /** Open the OS file picker (also used by ⌘O). */
  openPicker(): void
  /**
   * Open the picker and hand the selected file to a one-time callback. The
   * picker is clicked synchronously, so callers can safely use this from a
   * button handler and decide what to do only after a file was selected.
   */
  pickFile(onFile: (file: File) => void | Promise<void>): void
  /** Ref + change handler to spread onto a hidden `<input type="file">`. */
  inputProps: {
    ref: React.RefObject<HTMLInputElement | null>
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  }
}

export function useImageImport(): ImageImport {
  const { t } = useLingui()
  const loadImage = useStore((s) => s.loadImage)
  const setDesignMarkdown = useStore((s) => s.setDesignMarkdown)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const pickedFileHandlerRef = useRef<
    ((file: File) => void | Promise<void>) | null
  >(null)

  const importFile = useCallback(
    async (file: File): Promise<void> => {
      if (isDesignMarkdownFileName(file.name)) {
        try {
          const content = normalizedDesignMarkdown(await file.text())
          if (!content) throw new Error('DESIGN.md is empty.')
          setDesignMarkdown({
            name: file.name,
            content,
            importedAt: Date.now(),
          })
          toast.success('DESIGN.md imported', {
            description: 'The design system context will condition prototype generation.',
          })
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : 'Could not import DESIGN.md',
          )
        }
        return
      }

      if (!isSupportedImage(file)) {
        const name = file.name
        toast.error(
          t({ id: 'import.toast_unsupported', message: `Unsupported file: ${name}` }),
        )
        return
      }
      try {
        const bitmap = await decodeImage(file)
        loadImage({ bitmap, name: baseName(file.name) })
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t({ id: 'import.toast_load_failed', message: 'Could not load image' }),
        )
      }
    },
    [loadImage, setDesignMarkdown, t],
  )

  const openPicker = useCallback((): void => {
    pickedFileHandlerRef.current = null
    inputRef.current?.click()
  }, [])

  const pickFile = useCallback(
    (onFile: (file: File) => void | Promise<void>): void => {
      pickedFileHandlerRef.current = onFile
      inputRef.current?.click()
    },
    [],
  )

  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      const file = event.target.files?.[0]
      const onFile = pickedFileHandlerRef.current
      pickedFileHandlerRef.current = null
      // Reset so picking the same file twice still fires `change`.
      event.target.value = ''
      if (file) {
        if (onFile) void onFile(file)
        else void importFile(file)
      }
    },
    [importFile],
  )

  return {
    importFile,
    openPicker,
    pickFile,
    inputProps: { ref: inputRef, onChange },
  }
}
