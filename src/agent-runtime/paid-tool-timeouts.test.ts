import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DESKTOP_IMAGE_TOOL_TIMEOUT_MS,
  DESKTOP_LOCAL_TOOL_TIMEOUT_MS,
  NATIVE_IMAGE_TRANSPORT_TIMEOUT_MS,
  desktopPaidToolTimeoutMs,
} from './paid-tool-timeouts'

describe('paid tool timeout ownership', () => {
  it('lets the native image transport settle before the desktop owner', () => {
    expect(NATIVE_IMAGE_TRANSPORT_TIMEOUT_MS).toBe(300_000)
    expect(DESKTOP_IMAGE_TOOL_TIMEOUT_MS).toBeGreaterThan(
      NATIVE_IMAGE_TRANSPORT_TIMEOUT_MS,
    )
    expect(desktopPaidToolTimeoutMs('generate-image')).toBe(
      DESKTOP_IMAGE_TOOL_TIMEOUT_MS,
    )
    expect(desktopPaidToolTimeoutMs('edit-image')).toBe(
      DESKTOP_IMAGE_TOOL_TIMEOUT_MS,
    )
  })

  it('stays synchronized with the native buffered image failsafe', () => {
    const nativeProxy = readFileSync(
      resolve(process.cwd(), 'src-tauri/src/commands/ai/ai_proxy.rs'),
      'utf8',
    )
    expect(nativeProxy).toContain(
      `const GENERATION_BUFFERED_TIMEOUT_SECS: u64 = ${NATIVE_IMAGE_TRANSPORT_TIMEOUT_MS / 1_000};`,
    )
  })

  it('keeps deterministic local tools on the shorter owner deadline', () => {
    expect(desktopPaidToolTimeoutMs('cutout')).toBe(
      DESKTOP_LOCAL_TOOL_TIMEOUT_MS,
    )
    expect(desktopPaidToolTimeoutMs('semantic-cutout')).toBe(
      DESKTOP_LOCAL_TOOL_TIMEOUT_MS,
    )
  })
})
