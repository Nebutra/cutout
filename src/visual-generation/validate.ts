import {
  visualGenerationPlanSchema,
  type VisualDagNode,
  type VisualGenerationPlan,
} from "./contracts";

export function validateVisualGenerationPlan(
  input: unknown,
): VisualGenerationPlan {
  const plan = visualGenerationPlanSchema.parse(input);
  const byId = new Map<string, VisualDagNode>();
  for (const node of plan.nodes) {
    if (byId.has(node.id))
      throw new Error(`Duplicate visual node id: ${node.id}.`);
    byId.set(node.id, node);
  }
  for (const node of plan.nodes)
    for (const inputId of node.inputs) {
      if (!byId.has(inputId))
        throw new Error(`Visual node ${node.id} has unknown input ${inputId}.`);
      if (inputId === node.id)
        throw new Error(`Visual node ${node.id} cannot depend on itself.`);
    }
  assertAcyclic(plan.nodes, byId);
  const generated = plan.nodes.filter((node) => node.operation === "generate");
  const selects = plan.nodes.filter((node) => node.operation === "select");
  const edits = plan.nodes.filter((node) => node.operation === "edit");
  const reviews = plan.nodes.filter((node) => node.operation === "review");
  const promotions = plan.nodes.filter((node) => node.operation === "promote");
  if (generated.length !== plan.task.variants.count)
    throw new Error(
      "Visual plan generate count does not match task variants.count.",
    );
  if (
    new Set(generated.map((node) => node.variantIndex)).size !==
    generated.length
  )
    throw new Error("Visual generate variant indexes must be unique.");
  if (
    selects.length !== 1 ||
    edits.length !== 1 ||
    reviews.length !== 1 ||
    promotions.length !== 1
  )
    throw new Error(
      "Visual plan requires exactly one select, edit, review and promote node.",
    );
  const select = selects[0];
  const edit = edits[0];
  const review = reviews[0];
  const promote = promotions[0];
  assertExactInputs(
    select,
    generated.map((node) => node.id),
  );
  assertExactInputs(edit, [select.id]);
  assertExactInputs(review, [edit.id]);
  assertExactInputs(promote, [review.id]);
  return plan;
}

function assertExactInputs(
  node: VisualDagNode,
  expected: readonly string[],
): void {
  if (
    node.inputs.length !== expected.length ||
    expected.some((id) => !node.inputs.includes(id))
  )
    throw new Error(
      `Visual node ${node.id} does not have the required typed inputs.`,
    );
}
function assertAcyclic(
  nodes: readonly VisualDagNode[],
  byId: ReadonlyMap<string, VisualDagNode>,
): void {
  const state = new Map<string, "visiting" | "visited">();
  const visit = (id: string): void => {
    if (state.get(id) === "visiting")
      throw new Error(`Visual dependency cycle detected at ${id}.`);
    if (state.get(id) === "visited") return;
    state.set(id, "visiting");
    for (const dependency of byId.get(id)?.inputs ?? []) visit(dependency);
    state.set(id, "visited");
  };
  for (const node of nodes) visit(node.id);
}
