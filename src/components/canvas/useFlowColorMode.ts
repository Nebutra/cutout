import { useTheme } from 'next-themes'
import type { ColorMode } from '@xyflow/react'

export function useFlowColorMode(): ColorMode {
  const { resolvedTheme } = useTheme()

  return resolvedTheme === 'light' ? 'light' : 'dark'
}
