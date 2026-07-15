import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Registry browser architecture boundary',()=>{
  it('keeps the public Registry entry free of Node hosts and builtins',async()=>{const source=await readFile(resolve(process.cwd(),'src/registry/index.ts'),'utf8');expect(source).not.toMatch(/node-(?:host|service)/);expect(source).not.toMatch(/node:(?:fs|crypto|path)/)})
  it('loads Node services only through the explicit headless entry',async()=>{const source=await readFile(resolve(process.cwd(),'scripts/cutout-registry.mjs'),'utf8');expect(source).toContain('/src/registry/node.ts');expect(source).not.toContain('/src/registry/index.ts')})
  it('keeps browser consumers on the browser-safe entry',async()=>{for(const file of ['src/component-library/contracts.ts','src/component-library/service.ts','src/delivery-center/local-executors.ts']){const source=await readFile(resolve(process.cwd(),file),'utf8');expect(source).not.toMatch(/registry\/(?:node|node-host|node-service)/)}})
})
