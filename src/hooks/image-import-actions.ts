import { createContext, useContext } from 'react'

interface ImageImportActions {
  readonly openPicker: () => void
}

const ImageImportActionsContext = createContext<ImageImportActions | null>(null)

export const ImageImportActionsProvider = ImageImportActionsContext.Provider

export function useImageImportActions(): ImageImportActions {
  const actions = useContext(ImageImportActionsContext)
  if (!actions) {
    throw new Error('useImageImportActions must be used within ImageImportActionsProvider')
  }
  return actions
}
