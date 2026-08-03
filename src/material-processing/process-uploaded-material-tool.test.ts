import { describe, expect, it } from 'vitest'
import {
  processUploadedMaterialDecisionSchema,
  materialProcessingToolForSource,
  processUploadedMaterialTool,
} from './process-uploaded-material-tool'

describe('process uploaded material tool', () => {
  it('distinguishes semantic extraction from deterministic sheet slicing', async () => {
    const tool = processUploadedMaterialTool()
    expect(tool.name).toBe('process_uploaded_material')
    await expect(tool.execute({
      operation: 'extract-foreground',
      rationale: 'The source is an ordinary photo with a subject to isolate.',
    })).resolves.toMatchObject({ operation: 'extract-foreground' })
    expect(processUploadedMaterialDecisionSchema.parse({
      operation: 'split-isolated-assets',
      rationale: 'The source is already a separated asset sheet.',
    })).toMatchObject({ operation: 'split-isolated-assets' })
  })

  it('rejects generative or unknown operations', () => {
    expect(() => processUploadedMaterialDecisionSchema.parse({
      operation: 'redraw-subject',
      rationale: 'Generate a replacement.',
    })).toThrow()
  })

  it('is not offered without a loaded source bitmap', () => {
    expect(materialProcessingToolForSource(false)).toBeNull()
    expect(materialProcessingToolForSource(true)?.name).toBe('process_uploaded_material')
  })
})
