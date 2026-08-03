import { describe, expect, it, vi } from 'vitest'
import { createProviderCodingBackend } from './provider-backend'
import type { CodingTask } from './contracts'
import type { GenerateInput, GenerationService } from '@/services/ai/types'

const task: CodingTask = {
  version: 'cutout.coding-task.v1',
  taskId: 'coding:landing',
  kind: 'execute',
  goal: 'Build the selected route suite.',
  acceptanceCriteria: ['Use the selected Design System and assets.'],
  repo: { snapshotId: 'snapshot.one' },
  inputs: {
    designDocumentRef: 'design-ir:selected', brandKitRefs: [],
    designKitRefs: ['design-kit:selected'], prototypeRefs: ['prototype:home'],
    imageAssetRefs: ['asset:hero'],
  },
  target: { stack: 'vite-react', packageManager: 'pnpm' },
  constraints: { allowedPaths: ['src'], allowedCommands: ['typecheck'] },
  expectedRevision: 1,
  budget: { maxChangedFiles: 10, maxBytes: 20_000, maxDurationMs: 60_000 },
}

describe('Provider Coding Backend', () => {
  it('sends only bounded context and returns a task/snapshot-bound patch', async () => {
    let request: GenerateInput | undefined
    const generation: Pick<GenerationService, 'generateObject'> = {
      async generateObject(input, schema) {
        request = input
        return { ok: true, data: schema.parse({
          files: [{ path: 'src/App.tsx', operation: 'replace', contents: 'export default function App(){return <main />}' }],
          rationale: 'Implemented the approved route.',
        }) }
      },
    }
    const backend = createProviderCodingBackend({
      generation,
      assignment: { providerId: 'mox', model: 'gpt-5.5' },
      resolvedContext: { 'cutout/DESIGN.md': '# Quiet travel system' },
      visualReferences: [new Uint8Array([1, 2, 3])],
    })
    await expect(backend.propose(task, { 'src/App.tsx': 'export default null' })).resolves.toMatchObject({
      taskId: task.taskId,
      baseSnapshotId: task.repo.snapshotId,
      provenance: { backend: 'provider:mox:gpt-5.5', inputRefs: ['design-ir:selected', 'design-kit:selected', 'prototype:home', 'asset:hero'] },
    })
    expect(request?.providerId).toBe('mox')
    expect(request?.input?.[0]).toMatchObject({ type: 'text', text: expect.stringContaining('src/App.tsx') })
    expect(request?.input?.[0]).toMatchObject({ text: expect.stringContaining('cutout/DESIGN.md') })
    expect(request?.input?.[1]).toEqual({ type: 'image', image: new Uint8Array([1, 2, 3]) })
    expect(request?.system).toContain('Do not request tools')
  })

  it('rejects credential-shaped or over-budget context before provider execution', async () => {
    const generateObject = vi.fn() as unknown as GenerationService['generateObject']
    const backend = createProviderCodingBackend({
      generation: { generateObject },
      assignment: { providerId: 'mox', model: 'gpt-5.5' },
    })
    await expect(backend.propose(task, { 'src/key.ts': 'const key = "sk-1234567890abcdef"' })).rejects.toThrow('credential-shaped')
    await expect(backend.propose({ ...task, budget: { ...task.budget, maxBytes: 5 } }, { 'src/App.tsx': 'longer than five bytes' })).rejects.toThrow('context budget')
    expect(generateObject).not.toHaveBeenCalled()
  })
})
