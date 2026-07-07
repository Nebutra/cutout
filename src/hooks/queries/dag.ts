/**
 * Planned-DAG runner (spec §5/§D + §6/§E) — the mutations behind "规划并生成"
 * (plan-and-generate) and adjust-and-re-run.
 *
 *   - `useRunPlan`      brief → recognizeIntent → (questions? stop : planGraph) → runGraph
 *   - `useReRunSubtree` re-run one planned node + its descendants (reRunSubtree)
 *
 * The op→service dispatch lives in {@link createNodeRunner}: each planned node is
 * mapped to the SAME services the linear chain uses — `generate-image` →
 * generateImages, `edit-image`/`deconstruct` → editImage (垫图, or the Gemini
 * multimodal path for non-OpenAI providers), `cutout` → the existing worker
 * (`CutoutService.run`), `name` → the vision naming service. Node outputs are
 * read from upstream by id and written back into the store's `dagNodes` via the
 * Executor's `onStatus`, so the canvas streams live progress. The key stays in
 * Rust throughout. The planned graph is SEPARATE from the singleton
 * source/analysis that back the linear board→slices leg.
 */
import { useMutation } from '@tanstack/react-query'
import { useServices } from '@/services/context'
import { isErr } from '@/services/types'
import type { ServiceRegistry } from '@/services/types'
import type { GraphNodeSpec } from '@/dag/graph-spec'
import { planFromBrief } from '@/dag/run-plan'
import { runGraph, reRunSubtree, subtreeIds } from '@/dag/executor'
import { nameSlices, type SliceBox } from '@/services/ai/naming'
import type { ModelAssignment } from '@/services/ai/model-assignment-types'
import { getStoreState } from '@/store'
import type { DagNodeOutput } from '@/store/types'
import { decodeImage, bytesToBlob } from '@/lib/image'
import { useModelAssignments } from './ai-settings'

/** Whether a provider kind is served by the OpenAI-shaped `/images/edits`. */
function isOpenAiShaped(kind: string | undefined): boolean {
  return kind === 'openai' || kind === 'openai-compatible'
}

/** Pull the first image-kind output out of a node's upstream inputs. */
function firstImageBytes(
  inputs: ReadonlyMap<string, DagNodeOutput>,
): Uint8Array | null {
  for (const output of inputs.values()) {
    if (output.kind === 'image') return output.bytes
  }
  return null
}

/** Pull the first slices-kind output out of a node's upstream inputs. */
function firstSlices(
  inputs: ReadonlyMap<string, DagNodeOutput>,
): Extract<DagNodeOutput, { kind: 'slices' }> | null {
  for (const output of inputs.values()) {
    if (output.kind === 'slices') return output
  }
  return null
}

/**
 * Build the op→service dispatcher for one run. `imageKind` selects the 垫图
 * (`editImage`) vs. Gemini multimodal path; the model slots + services are
 * resolved once by the caller.
 */
function createNodeRunner(
  services: ServiceRegistry,
  image: ModelAssignment,
  chat: ModelAssignment,
  imageKind: string | undefined,
) {
  const { generation, prompts, cutout } = services

  return async function runNode(
    node: GraphNodeSpec,
    inputs: ReadonlyMap<string, DagNodeOutput>,
  ): Promise<DagNodeOutput> {
    switch (node.op) {
      case 'generate-image': {
        const result = await generation.generateImages({
          providerId: image.providerId,
          model: image.model,
          prompt: node.prompt ?? node.label,
        })
        if (isErr(result)) throw new Error(result.error)
        const asset = result.data[0]
        if (!asset) throw new Error('The model returned no image.')
        return { kind: 'image', bytes: asset.bytes, mediaType: asset.mediaType }
      }

      case 'edit-image': {
        const reference = firstImageBytes(inputs)
        if (!reference) throw new Error('The mockup step has no upstream image.')
        const result = await generation.editImage({
          providerId: image.providerId,
          model: image.model,
          prompt: node.prompt ?? node.label,
          images: [reference],
          inputFidelity: node.fidelity ?? 'high',
        })
        if (isErr(result)) throw new Error(result.error)
        const asset = result.data[0]
        if (!asset) throw new Error('The model returned no image.')
        return { kind: 'image', bytes: asset.bytes, mediaType: asset.mediaType }
      }

      case 'deconstruct': {
        const mockup = firstImageBytes(inputs)
        if (!mockup) throw new Error('The board step has no upstream mockup.')
        const rendered = await prompts.render({ id: 'ui-asset-deconstruction' })
        const promptText = node.prompt
          ? `${rendered.system}\n\n${node.prompt}`
          : rendered.system
        // 垫图 for OpenAI-shaped providers; Gemini keeps the multimodal path.
        const result = isOpenAiShaped(imageKind)
          ? await generation.editImage({
              providerId: image.providerId,
              model: image.model,
              prompt: promptText,
              images: [mockup],
              inputFidelity: 'high',
            })
          : await generation.generateImages({
              providerId: image.providerId,
              model: image.model,
              promptRef: { id: 'ui-asset-deconstruction' },
              input: [
                ...(node.prompt ? [{ type: 'text' as const, text: node.prompt }] : []),
                { type: 'image', image: mockup },
              ],
            })
        if (isErr(result)) throw new Error(result.error)
        const asset = result.data[0]
        if (!asset) throw new Error('The model returned no image.')
        return { kind: 'image', bytes: asset.bytes, mediaType: asset.mediaType }
      }

      case 'cutout': {
        const boardBytes = firstImageBytes(inputs)
        if (!boardBytes) throw new Error('The cutout step has no upstream board.')
        const bitmap = await decodeImage(bytesToBlob(boardBytes, 'image/png'))
        const result = await cutout.run({ bitmap, params: getStoreState().params })
        if (isErr(result)) throw new Error(result.error)
        return { kind: 'slices', slices: result.data.slices, boardBytes }
      }

      case 'name': {
        const upstream = firstSlices(inputs)
        if (!upstream) throw new Error('The naming step has no upstream slices.')
        const boxes: SliceBox[] = upstream.slices.map((s) => ({
          index: s.index,
          box: s.box,
        }))
        const result = await nameSlices(generation, {
          providerId: chat.providerId,
          model: chat.model,
          imageBytes: upstream.boardBytes,
          slices: boxes,
          effort: chat.effort,
        })
        if (isErr(result)) throw new Error(result.error)
        return { kind: 'names', names: result.data }
      }

      default:
        // `plan` is a bootstrap op, not something the Executor runs.
        throw new Error(`Unsupported planned op: ${node.op}`)
    }
  }
}

/** Resolve the image provider's kind (for the 垫图 vs. multimodal branch). */
async function imageProviderKind(
  services: ServiceRegistry,
  providerId: string,
): Promise<string | undefined> {
  const configs = await services.providers.list()
  return configs.find((c) => c.id === providerId)?.kind
}

/**
 * Mutation: recognize the intent behind the brief (chat slot), then either
 * surface clarifying questions and STOP, or plan a graph from the enriched
 * intent and run it (image slot) — spec §6/§7. The recognized `IntentProfile`
 * is recorded on the store either way so the BriefNode can show the derived
 * understanding. The component gates on both slots being assigned (intent AND
 * planning both ride the chat slot; without it we fall back to the raw brief via
 * `planFromBrief` → `planGraph`, which the recognition step covers); the throws
 * here are a safety net.
 */
export function useRunPlan() {
  const services = useServices()
  const assignments = useModelAssignments()

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const chat = assignments.data?.chat
      if (!chat) throw new Error('No chat/vision model is configured for planning.')
      const image = assignments.data?.image
      if (!image) throw new Error('No image-generation model is configured.')

      const brief = getStoreState().brief.trim()
      if (!brief) throw new Error('Write a brief before planning.')

      // Recognize → (clarify | plan). Pure orchestration lives in the DAG layer.
      const outcome = await planFromBrief(services.generation, {
        providerId: chat.providerId,
        model: chat.model,
        brief,
        effort: chat.effort,
      })
      if (isErr(outcome)) throw new Error(outcome.error)

      // Surface the derived understanding regardless of which branch we took.
      getStoreState().setIntent(outcome.data.intent)

      // Low confidence / open questions → stop; the BriefNode shows the prompts.
      if (outcome.data.kind === 'clarify') return

      const graph = outcome.data.graph
      getStoreState().setGraph(graph)

      const kind = await imageProviderKind(services, image.providerId)
      const runNode = createNodeRunner(services, image, chat, kind)
      await runGraph<DagNodeOutput>(graph, {
        runNode,
        onStatus: (id, state) => getStoreState().setDagNodeState(id, state),
      })
    },
  })
}

/**
 * Mutation: re-run one planned node and its descendants (adjust-and-re-run,
 * spec §5/§D). Prior outputs feed the re-run; only the stale subtree re-executes.
 */
export function useReRunSubtree() {
  const services = useServices()
  const assignments = useModelAssignments()

  return useMutation<void, Error, string>({
    mutationFn: async (nodeId) => {
      const chat = assignments.data?.chat
      const image = assignments.data?.image
      if (!chat || !image) throw new Error('Configure a chat and an image model.')

      const store = getStoreState()
      const graph = store.graph
      if (!graph) throw new Error('There is no planned graph to re-run.')

      // Mark the stale subtree idle up front so the canvas reflects the re-run.
      const stale = subtreeIds(graph, nodeId)
      store.resetDagNodes(stale)

      const prior = new Map(Object.entries(getStoreState().dagNodes))
      const kind = await imageProviderKind(services, image.providerId)
      const runNode = createNodeRunner(services, image, chat, kind)
      await reRunSubtree<DagNodeOutput>(graph, nodeId, {
        runNode,
        onStatus: (id, state) => getStoreState().setDagNodeState(id, state),
      }, prior)
    },
  })
}
