import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

function run(...argumentsValue: string[]) {
  return spawnSync(process.execPath, ['scripts/design-os-benchmark.mjs', ...argumentsValue], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: false,
  })
}

describe('Design OS admitted benchmark CLI boundary', () => {
  it('pins admitted replay to the release native Host designated requirement', async () => {
    const source = await readFile('scripts/design-os-benchmark.mjs', 'utf8')

    expect(source).toContain("spawnSync('/usr/bin/codesign'")
    expect(source).toContain('com.nebutra.cutout.commerce-credential-owner')
    expect(source).toContain('certificate leaf[subject.OU] = "2L5YC85FQ7"')
    expect(source).toContain('`-R=${nativeHostMacosRequirement}`')
  })

  it('rejects unsupported arguments before loading benchmark state', () => {
    const result = run('--unreviewed')

    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain(
      'Unsupported Design OS benchmark argument: --unreviewed',
    )
  })

  it('rejects traversal-shaped admitted job ids', () => {
    const result = run('--', '--admitted-job', '../outside')

    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain(
      '--admitted-job requires one opaque Commerce operator job id.',
    )
  })
})
