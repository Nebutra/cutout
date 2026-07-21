/** Accepted image MIME types for import (drop + picker). */
export const ACCEPTED_IMAGE_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/bmp',
  'image/gif',
]

/** `localStorage` key remembering the resizable pane layout (spec §4c). */
export const WORKSPACE_LAYOUT_KEY = 'acs-main'

/** Breakpoint (px) below which the workspace stacks vertically (spec §4c). */
export const STACK_BREAKPOINT = 1040
