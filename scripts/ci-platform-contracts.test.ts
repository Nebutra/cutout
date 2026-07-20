import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { resolveChromeExecutable } from '../playwright.config'
import { parseSkillFrontmatter } from './lib/skill-frontmatter.mjs'

describe('cross-platform CI contracts', () => {
  it('installs Chromium before running the contract test suite', async () => {
    const source = await readFile('.github/workflows/ci.yml', 'utf8')
    const workflow = YAML.parse(source)
    const steps = workflow.jobs.contract.steps as Array<{ if?: string; run?: string }>
    const testIndex = steps.findIndex((step) => step.run === 'pnpm test')
    const installs = steps.filter((step) => step.run?.includes('playwright install'))

    expect(installs).toEqual([
      expect.objectContaining({ if: "runner.os == 'Linux'", run: expect.stringContaining('--with-deps chromium') }),
      expect.objectContaining({ if: "runner.os != 'Linux'", run: expect.stringContaining('install chromium') }),
    ])
    expect(steps.indexOf(installs[0])).toBeLessThan(testIndex)
    expect(steps.indexOf(installs[1])).toBeLessThan(testIndex)
  })

  it('uses bundled Playwright browsers away from macOS unless overridden', () => {
    expect(resolveChromeExecutable(undefined, 'linux')).toBeUndefined()
    expect(resolveChromeExecutable(undefined, 'win32')).toBeUndefined()
    expect(resolveChromeExecutable(undefined, 'darwin')).toContain('Google Chrome.app')
    expect(resolveChromeExecutable('/custom/chrome', 'linux')).toBe('/custom/chrome')
  })

  it.each(['\n', '\r\n'])('accepts product skill frontmatter with %j line endings', (eol) => {
    const source = ['---', 'name: example', 'description: Example skill', '---', 'Body'].join(eol)

    expect(parseSkillFrontmatter(source)).toBe([
      'name: example',
      'description: Example skill',
    ].join(eol))
  })
})
