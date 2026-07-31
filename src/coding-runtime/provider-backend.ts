import { z } from 'zod'
import type { GenerationService } from '@/services/ai/types'
import type { ModelAssignment } from '@/services/ai/model-assignment-types'
import {
  codingFilePatchSchema,
  codingPatchSchema,
  codingTaskSchema,
  type CodingPatch,
  type CodingTask,
} from './contracts'
import type { CodingBackend } from './runtime'

const MAX_PROVIDER_CONTEXT_BYTES = 2_000_000
const MAX_PROVIDER_REFERENCE_BYTES = 64 * 1024 * 1024
const MAX_PROVIDER_REFERENCES = 64
const CREDENTIAL_VALUE = /(?:\b(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+\b)/i

const proposalSchema = z.object({
  files: z.array(codingFilePatchSchema).min(1).max(2_000),
  rationale: z.string().min(1).max(20_000),
}).strict()

export interface ProviderCodingBackendOptions {
  readonly generation: Pick<GenerationService, 'generateObject'>
  readonly assignment: ModelAssignment
  readonly resolvedContext?: Readonly<Record<string, string>>
  readonly visualReferences?: readonly Uint8Array[]
}

export function createProviderCodingBackend(
  options: ProviderCodingBackendOptions,
): CodingBackend {
  const backendId = `provider:${options.assignment.providerId}:${options.assignment.model}`
  return {
    id: backendId,
    async propose(input, context, signal): Promise<CodingPatch> {
      const task = codingTaskSchema.parse(input)
      const serialized = serializeCodingContext(task, mergeContext(context, options.resolvedContext))
      const visualReferences = validateVisualReferences(options.visualReferences ?? [])
      const result = await options.generation.generateObject({
        providerId: options.assignment.providerId,
        model: options.assignment.model,
        system: codingSystemPrompt(task),
        input: [
          { type: 'text', text: serialized },
          ...visualReferences.map((image) => ({ type: 'image' as const, image })),
        ],
        signal,
      }, proposalSchema)
      if (!result.ok) throw new Error(`coding-provider: ${result.error}`)
      return codingPatchSchema.parse({
        version: 'cutout.coding-patch.v1',
        taskId: task.taskId,
        baseSnapshotId: task.repo.snapshotId,
        files: result.data.files,
        rationale: result.data.rationale,
        provenance: {
          backend: backendId,
          inputRefs: codingInputRefs(task),
        },
      })
    },
  }
}

function mergeContext(
  workspace: Readonly<Record<string, string>>,
  resolved: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> {
  const merged = { ...workspace }
  for (const [path, contents] of Object.entries(resolved ?? {})) {
    if (path in merged) throw new Error(`policy-denied: Duplicate Coding context path: ${path}`)
    merged[path] = contents
  }
  return merged
}

function validateVisualReferences(input: readonly Uint8Array[]): readonly Uint8Array[] {
  if (input.length > MAX_PROVIDER_REFERENCES) {
    throw new Error('budget-exceeded: Coding visual references exceed the count budget.')
  }
  const bytes = input.reduce((total, reference) => total + reference.byteLength, 0)
  if (bytes > MAX_PROVIDER_REFERENCE_BYTES) {
    throw new Error('budget-exceeded: Coding visual references exceed the byte budget.')
  }
  return input
}

function serializeCodingContext(
  task: CodingTask,
  context: Readonly<Record<string, string>>,
): string {
  const entries = Object.entries(context).sort(([left], [right]) => left.localeCompare(right))
  const value = JSON.stringify({
    task,
    files: entries.map(([path, contents]) => ({ path, contents })),
  })
  const bytes = new TextEncoder().encode(value).byteLength
  if (bytes > Math.min(task.budget.maxBytes, MAX_PROVIDER_CONTEXT_BYTES)) {
    throw new Error('budget-exceeded: Coding context exceeds the provider context budget.')
  }
  if (CREDENTIAL_VALUE.test(value)) {
    throw new Error('policy-denied: Coding context contains credential-shaped data.')
  }
  return value
}

function codingSystemPrompt(task: CodingTask): string {
  return [
    'You are Cutout\'s controlled Coding Backend.',
    'Return only the structured patch requested by the output schema.',
    'Use only the supplied file contents and design/material references.',
    'Do not request tools, shell commands, network access, credentials, or additional host files.',
    'Every changed path must remain within constraints.allowedPaths.',
    'Use create for absent files, replace/delete only for supplied files, and preserve previousSha256 when supplied.',
    `Task kind: ${task.kind}.`,
    `Goal: ${task.goal}`,
    `Acceptance criteria:\n${task.acceptanceCriteria.map((item) => `- ${item}`).join('\n')}`,
  ].join('\n\n')
}

function codingInputRefs(task: CodingTask): string[] {
  return [
    task.inputs.designDocumentRef,
    ...task.inputs.brandKitRefs,
    ...task.inputs.designKitRefs,
    ...task.inputs.prototypeRefs,
    ...task.inputs.imageAssetRefs,
  ]
}
