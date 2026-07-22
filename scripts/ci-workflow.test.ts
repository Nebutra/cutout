import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8')

describe('CI workflow contract', () => {
  it('is reusable as the exact release quality gate with read-only repository access', () => {
    expect(workflow).toContain('workflow_call:')
    expect(workflow).toContain('source_sha:')
    expect(workflow).toMatch(/permissions:\n\s+contents: read/)
    expect(workflow.match(/ref: \$\{\{ inputs\.source_sha \|\| github\.sha \}\}/g)).toHaveLength(3)
  })

  it('compiles and tests native Tauri code on every supported desktop OS', () => {
    expect(workflow).toContain('os: [ubuntu-22.04, macos-latest, windows-2022]')
    expect(workflow).toContain('cargo test --locked --manifest-path src-tauri/Cargo.toml')
    expect(workflow).toContain('cargo check --locked --manifest-path src-tauri/Cargo.toml')
    expect(workflow).toContain('scripts/tauri-config.test.ts scripts/tauri-capabilities.test.ts')
  })

  it('installs Chromium before contract tests that exercise generated starters', () => {
    expect(workflow.indexOf('playwright install')).toBeGreaterThan(-1)
    expect(workflow.indexOf('playwright install')).toBeLessThan(workflow.indexOf('pnpm test\n'))
  })

  it('gates releases on focused desktop visual and updater coverage', () => {
    expect(workflow).toContain('tests/visual/home-composer-surface.spec.ts')
    expect(workflow).toContain('tests/visual/update-settings.spec.ts')
    expect(workflow).toContain('--project=desktop-chrome')
    expect(workflow).not.toContain('continue-on-error')
    expect(workflow).not.toMatch(/^\s*- run: pnpm test:visual\s*$/m)
  })

  it('publishes one stable aggregate check for branch protection', () => {
    expect(workflow).toContain('name: Quality gate')
    expect(workflow).toContain('needs: [native, contract, browser]')
    expect(workflow).toContain('NATIVE_RESULT: ${{ needs.native.result }}')
    expect(workflow).toContain('CONTRACT_RESULT: ${{ needs.contract.result }}')
    expect(workflow).toContain('BROWSER_RESULT: ${{ needs.browser.result }}')
  })
})
