import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const CONTROL_FILES = [
  'src/control-protocol/control-protocol.ts',
  'src/control-protocol/run-control.ts',
  'src/headless/runtime.ts',
  'scripts/cutout.mjs',
  'scripts/cutout-mcp.mjs',
]

describe('Integration SDK architecture boundary', () => {
  it('keeps External Agent Control independent from provider adapters and legacy connectors', () => {
    for (const path of CONTROL_FILES) {
      const source = readFileSync(path, 'utf8')
      expect(source, path).not.toMatch(/from\s+['"][^'"]*(?:connectors\/figma|connectors\/repository|integration-sdk\/adapters|@figma|@notionhq|octokit|canva)[^'"]*['"]/) 
    }
  })
})
