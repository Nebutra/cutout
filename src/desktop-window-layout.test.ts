import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface DesktopWindowConfig {
  readonly app: {
    readonly windows: ReadonlyArray<{
      readonly width: number
      readonly height: number
      readonly minWidth: number
      readonly minHeight: number
    }>
  }
}

describe('desktop window layout', () => {
  it('opens with a spacious default while preserving the compact minimum', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'),
    ) as DesktopWindowConfig

    expect(config.app.windows[0]).toMatchObject({
      width: 1440,
      height: 960,
      minWidth: 1040,
      minHeight: 720,
    })
  })
})
