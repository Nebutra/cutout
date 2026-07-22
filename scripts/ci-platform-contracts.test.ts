import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { resolveChromeExecutable } from '../playwright.config'
import { normalizeText, sha256NormalizedText } from './lib/normalized-text.mjs'
import { nodeCommandNeedsShell, resolveNodeCommand } from './lib/node-command.mjs'
import { parseSkillFrontmatter } from './lib/skill-frontmatter.mjs'
import { resolveVitestMaxWorkers } from './lib/vitest-workers.ts'

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

  it('runs screenshot baselines on their canonical macOS Chrome platform', async () => {
    const source = await readFile('.github/workflows/ci.yml', 'utf8')
    const workflow = YAML.parse(source)

    expect(workflow.jobs.browser['runs-on']).toBe('macos-latest')
    expect(workflow.jobs.browser.steps).toContainEqual(expect.objectContaining({
      run: 'pnpm exec playwright install chromium',
    }))
  })

  it('uses bundled Playwright browsers away from macOS unless overridden', () => {
    expect(resolveChromeExecutable(undefined, 'linux')).toBeUndefined()
    expect(resolveChromeExecutable(undefined, 'win32')).toBeUndefined()
    expect(resolveChromeExecutable(undefined, 'darwin')).toContain('Google Chrome.app')
    expect(resolveChromeExecutable('/custom/chrome', 'linux')).toBe('/custom/chrome')
  })

  it('caps Vitest concurrency on Windows runners', () => {
    expect(resolveVitestMaxWorkers('win32')).toBe(2)
    expect(resolveVitestMaxWorkers('darwin')).toBeUndefined()
    expect(resolveVitestMaxWorkers('linux')).toBeUndefined()
  })

  it.each(['\n', '\r\n'])('accepts product skill frontmatter with %j line endings', (eol) => {
    const source = ['---', 'name: example', 'description: Example skill', '---', 'Body'].join(eol)

    expect(parseSkillFrontmatter(source)).toBe([
      'name: example',
      'description: Example skill',
    ].join(eol))
  })

  it('keeps plugin text and fingerprints stable across checkout line endings', () => {
    const lf = 'const value = true\n// done\n'
    const crlf = 'const value = true\r\n// done\r\n'

    expect(normalizeText(crlf)).toBe(lf)
    expect(sha256NormalizedText(crlf)).toBe(sha256NormalizedText(lf))
  })

  it('selects Windows command shims for Node package executables', () => {
    expect(resolveNodeCommand('npm', 'win32')).toBe('npm.cmd')
    expect(resolveNodeCommand('C:\\repo\\node_modules\\.bin\\tsc', 'win32')).toBe('C:\\repo\\node_modules\\.bin\\tsc.cmd')
    expect(resolveNodeCommand('node.exe', 'win32')).toBe('node.exe')
    expect(resolveNodeCommand('taskkill.exe', 'win32')).toBe('taskkill.exe')
    expect(resolveNodeCommand('pnpm', 'linux')).toBe('pnpm')
    expect(nodeCommandNeedsShell('npm.cmd', 'win32')).toBe(true)
    expect(nodeCommandNeedsShell('C:\\tools\\pnpm.cmd', 'win32')).toBe(true)
    expect(nodeCommandNeedsShell('custom.cmd', 'win32')).toBe(false)
    expect(nodeCommandNeedsShell('node.exe', 'win32')).toBe(false)
    expect(nodeCommandNeedsShell('npm.cmd', 'linux')).toBe(false)
  })
})
