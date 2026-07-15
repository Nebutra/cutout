import type { MoneyEstimate } from "@/control-protocol/paid-tool-contract";
import {
  visualGenerationTaskSchema,
  type VisualGenerationPlan,
  type VisualGenerationTask,
  type VisualDagNode,
} from "./contracts";
import { validateVisualGenerationPlan } from "./validate";

export interface VisualPlanEstimate {
  readonly generate: MoneyEstimate;
  readonly edit: MoneyEstimate;
}

export function planVisualGeneration(
  taskInput: VisualGenerationTask,
  estimate: VisualPlanEstimate,
): VisualGenerationPlan {
  const task = visualGenerationTaskSchema.parse(taskInput);
  const generated: VisualDagNode[] = Array.from(
    { length: task.variants.count },
    (_, index) => ({
      id: `${task.taskId}:variant:${index + 1}`,
      operation: "generate" as const,
      inputs: [],
      variantIndex: index,
    }),
  );
  const select: VisualDagNode = {
    id: `${task.taskId}:select`,
    operation: "select",
    inputs: generated.map((node) => node.id),
  };
  const edit: VisualDagNode = {
    id: `${task.taskId}:${task.refinement.mode === "local-mask" ? "local-repaint" : "refine"}`,
    operation: "edit",
    inputs: [select.id],
    editPrompt: task.refinement.instruction,
  };
  const review: VisualDagNode = {
    id: `${task.taskId}:review`,
    operation: "review",
    inputs: [edit.id],
    stage: "edit-review",
  };
  const promote: VisualDagNode = {
    id: `${task.taskId}:promote`,
    operation: "promote",
    inputs: [review.id],
  };
  const amount =
    estimate.generate.amount * task.variants.count + estimate.edit.amount;
  const credits =
    (estimate.generate.credits ?? 0) * task.variants.count +
    (estimate.edit.credits ?? 0);
  return validateVisualGenerationPlan({
    version: "visual-generation-plan.v1",
    planId: `visual-plan:${task.taskId}`,
    task,
    nodes: [...generated, select, edit, review, promote],
    estimatedCost: { currency: estimate.generate.currency, amount, credits },
    idempotencyKey: `visual:${task.taskId}:${task.catalogItemId}`,
  });
}
