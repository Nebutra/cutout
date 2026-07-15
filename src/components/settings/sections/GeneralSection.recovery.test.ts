import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe,expect,it } from 'vitest'

describe('General settings local recovery entry',()=>{
  const source=readFileSync(join(process.cwd(),'src/components/settings/sections/GeneralSection.tsx'),'utf8')
  it('exposes only local UI reset and redacted diagnostic preview/export',()=>{expect(source).toContain('Local recovery');expect(source).toContain('Reset UI state');expect(source).toContain('Preview diagnostics');expect(source).toContain('Export diagnostics');expect(source).toContain('Project data is not deleted.');expect(source).not.toMatch(/remote telemetry|OAuth|cloud sync/i)})
})
