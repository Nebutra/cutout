import {
  visualGenerationTaskSchema,
  type VisualGenerationPlan,
  type VisualGenerationTask,
  type VisualDagNode,
} from "./contracts";
import { validateVisualGenerationPlan } from "./validate";

export function planVisualGeneration(
  taskInput: VisualGenerationTask,
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
  return validateVisualGenerationPlan({
    version: "visual-generation-plan.v1",
    planId: `visual-plan:${task.taskId}`,
    task,
    nodes: [...generated, select, edit, review, promote],
    idempotencyKey: `visual:${task.taskId}:${task.catalogItemId}`,
  });
}
