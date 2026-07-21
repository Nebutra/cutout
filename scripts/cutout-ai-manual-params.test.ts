import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const rootSource = (path: string) =>
  readFileSync(join(process.cwd(), path), 'utf8')

describe('AI Native manual cutout parameters', () => {
  it('does not expose removed actions through the CLI or repository guidance', () => {
    const cli = rootSource('scripts/cutout-ai.mjs')
    const docs = rootSource('docs/AI_NATIVE.md')
    const settingsSpec = rootSource('docs/superpowers/specs/2026-07-02-settings-page-design.md')
    const settingsPlan = rootSource('docs/superpowers/plans/2026-07-02-settings-page.md')
    const canvasSpec = rootSource('docs/superpowers/specs/2026-07-02-pipeline-canvas-design.md')
    const refactorSpec = rootSource('docs/superpowers/specs/2026-07-01-tauri-cutout-refactor-design.md')
    const removedActions = /set-param|set-params|reset-params/
    const removedImplementation = /setParam|resetParams|ParameterControls|ParameterSlider|useParamAutoRun|PARAM_RANGES/

    expect(cli).not.toMatch(removedActions)
    expect(docs).not.toMatch(removedActions)
    for (const guidance of [settingsSpec, settingsPlan, canvasSpec, refactorSpec]) {
      expect(guidance).not.toMatch(removedImplementation)
    }
  })
})
