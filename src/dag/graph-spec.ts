/**
 * GraphSpec (spec §3/§B) — the AI-emitted, zod-validated DAG contract.
 *
 * The Planner (chat slot) emits a `GraphSpec`; the Executor runs it topologically
 * over a small, reusable, typed node vocabulary. Keeping the shape a zod schema
 * (not just a TS type) lets `generateObject` enforce it at the model boundary and
 * lets `validateGraph` (see `./validate`) reject cyclic / dangling specs before
 * anything executes. The model slot for each op is resolved from Settings at run
 * time — it is deliberately NOT embedded in the spec.
 *
 * This module owns only the SHAPE (types + schema). Structural validity (unique
 * ids, edges referencing real nodes, exact input/edge equality, acyclicity) lives in
 * `validate.ts` so the schema stays a pure, reusable contract.
 */
import { z } from 'zod'

/**
 * The reusable node vocabulary (spec §3 table). Each op maps to one service:
 * `generate-image` (image slot) · `edit-image` (垫图 via editImage) ·
 * `deconstruct` (image slot) · `cutout` (deterministic worker) · `name`
 * (chat + generateObject). Planning is a bootstrap concern and never appears as
 * an executable node.
 */
export const NODE_OPS = [
  'generate-image',
  'edit-image',
  'deconstruct',
  'cutout',
  'name',
] as const

/** One operation a graph node performs. */
export type NodeOp = (typeof NODE_OPS)[number]

/** Zod enum mirroring {@link NODE_OPS} — the op field's contract. */
export const nodeOpSchema = z.enum(NODE_OPS)

/**
 * One node in an AI-emitted graph. `inputs` are the ids of upstream nodes whose
 * OUTPUT feeds this one (data dependencies); inputs and incoming edges must be
 * an exact one-to-one match (enforced in `validate.ts`). The model slot is
 * resolved from Settings, not embedded — only op-specific hints live here.
 */
export interface GraphNodeSpec {
  /** Planner-assigned, unique within the graph. */
  readonly id: string
  /** Which operation this node performs. */
  readonly op: NodeOp
  /** Human-readable label, e.g. "原型图·购物车". */
  readonly label: string
  /** Per-node instruction (screen brief, style spec…); op-dependent. */
  readonly prompt?: string
  /** Ids of upstream nodes whose output feeds this node (data deps). */
  readonly inputs: readonly string[]
  /** `edit-image` (垫图) hint — `high` preserves the reference's style. */
  readonly fidelity?: 'high' | 'low'
}

/** A directed dependency edge: the `from` node's output flows into `to`. */
export interface GraphEdge {
  readonly from: string
  readonly to: string
}

/** The whole AI-emitted graph: a set of typed nodes + directed edges. */
export interface GraphSpec {
  readonly nodes: readonly GraphNodeSpec[]
  readonly edges: readonly GraphEdge[]
}

/** Node schema — shape only; cross-node validity is checked in `validate.ts`. */
export const graphNodeSpecSchema = z.object({
  id: z.string().min(1),
  op: nodeOpSchema,
  label: z.string().min(1),
  prompt: z.string().optional(),
  inputs: z.array(z.string().min(1)).default([]),
  fidelity: z.enum(['high', 'low']).optional(),
})

/** Edge schema — endpoints must be non-empty strings. */
export const graphEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
})

/**
 * The GraphSpec schema handed to `generateObject` (planner) — enforces the shape
 * at the model boundary. STRUCTURAL validity (acyclic, no dangling edges, unique
 * ids) is a separate pass in `validate.ts`, not expressible cleanly in zod.
 */
export const graphSpecSchema = z.object({
  nodes: z.array(graphNodeSpecSchema),
  edges: z.array(graphEdgeSchema).default([]),
})

/** The exact type `graphSpecSchema` parses to (defaults applied). */
export type ParsedGraphSpec = z.infer<typeof graphSpecSchema>
