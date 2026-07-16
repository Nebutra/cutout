import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('home navigation capability honesty', () => {
  it('does not expose the unimplemented Published destination', () => {
    const source = readFileSync(`${process.cwd()}/src/components/home/ProjectHome.tsx`, 'utf8')
    expect(source).not.toContain('PublishedProjectsPlaceholder')
    expect(source).not.toContain('onSelectSection("published")')
    expect(source).not.toContain('"projects" | "published"')
  })
})
