import { z } from 'zod'
import type { AgentToolDefinition } from '@/agent-runtime/tool-loop'

export const processUploadedMaterialDecisionSchema = z.object({
  operation: z.enum(['extract-foreground', 'split-isolated-assets']),
  rationale: z.string().min(1).max(1_000),
}).strict()

export type ProcessUploadedMaterialDecision = z.infer<
  typeof processUploadedMaterialDecisionSchema
>

export function processUploadedMaterialTool(): AgentToolDefinition<
  ProcessUploadedMaterialDecision,
  ProcessUploadedMaterialDecision
> {
  return {
    name: 'process_uploaded_material',
    description:
      'Process the image already loaded in the workspace without generating or redrawing it. ' +
      'Use extract-foreground when the user wants the subject isolated from an ordinary photo ' +
      'or its background removed. Use split-isolated-assets only when the source is already an ' +
      'asset sheet whose items are separated by white or transparent background. Do not call ' +
      'this for prototype generation, image generation, or edits that change source pixels.',
    inputSchema: processUploadedMaterialDecisionSchema,
    isReadOnly: true,
    async execute(input) {
      return input
    },
  }
}

export function materialProcessingToolForSource(hasBitmap: boolean) {
  return hasBitmap ? processUploadedMaterialTool() : null
}
