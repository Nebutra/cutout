import { z } from "zod";
import { moneyEstimateSchema } from "@/control-protocol/paid-tool-contract";

const id = z.string().min(1).max(160);
const text = z.string().min(1).max(20_000);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);

export const visualGenerationTaskVersion = "visual-generation-task.v1" as const;

export const visualArtifactKindSchema = z.enum([
  "brand-logo-seed",
  "brand-key-visual",
  "brand-pattern",
  "brand-mascot",
  "application-mockup",
  "design-reference",
  "ui-screen",
  "illustration",
  "icon-seed",
]);
export type VisualArtifactKind = z.infer<typeof visualArtifactKindSchema>;

export const referenceLockSchema = z
  .object({
    referenceId: id,
    artifactId: id,
    sha256,
    mediaType: z.string().regex(/^image\/(?:png|jpeg|webp)$/),
    role: z.enum(["base", "style", "identity", "composition", "mask"]),
    strength: z.number().min(0).max(1),
    immutable: z.literal(true),
    provenanceId: id,
  })
  .strict();
export type ReferenceLock = z.infer<typeof referenceLockSchema>;

export const promptSpecSchema = z
  .object({
    version: z.literal("visual-prompt.v1"),
    objective: text,
    subject: text,
    composition: text,
    artDirection: text,
    constraints: z.array(text).min(1).max(64),
    negativeConstraints: z.array(text).max(64).default([]),
    output: z
      .object({
        size: z.string().regex(/^\d+x\d+$/),
        mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]),
        transparent: z.boolean(),
      })
      .strict(),
    locale: z.string().min(2).max(32).default("en"),
  })
  .strict();
export type PromptSpec = z.infer<typeof promptSpecSchema>;

export const visualGenerationTaskSchema = z
  .object({
    version: z.literal(visualGenerationTaskVersion),
    taskId: id,
    catalogItemId: id,
    kind: visualArtifactKindSchema,
    prompt: promptSpecSchema,
    references: z.array(referenceLockSchema).max(16).default([]),
    variants: z
      .object({
        count: z.number().int().min(1).max(8),
        parallelism: z.number().int().min(1).max(4),
      })
      .strict(),
    consistency: z
      .object({
        seriesId: id.optional(),
        serial: z.number().int().nonnegative().optional(),
        predecessorMasterId: id.optional(),
        lockedTraits: z.array(text).max(64).default([]),
      })
      .strict(),
    routing: z
      .object({
        preferredModel: z.string().min(1).default("gpt-image-2"),
        requiredCapabilities: z
          .array(
            z.enum([
              "image-generate",
              "image-edit",
              "multi-reference",
              "mask-edit",
            ]),
          )
          .min(1),
        allowCompatibleFallback: z.boolean().default(true),
      })
      .strict(),
    refinement: z
      .object({
        mode: z.enum(["full-frame", "local-mask"]).default("full-frame"),
        instruction: text.default(
          "Refine the selected candidate while preserving locked identity, composition, and series traits.",
        ),
      })
      .strict()
      .default({
        mode: "full-frame",
        instruction:
          "Refine the selected candidate while preserving locked identity, composition, and series traits.",
      }),
    budget: z
      .object({
        ceiling: moneyEstimateSchema,
        approvalPolicy: z.enum(["explicit", "auto-within-budget"]),
        maxAttemptsPerNode: z.number().int().min(1).max(4).default(2),
      })
      .strict(),
    publication: z
      .object({
        intendedUse: z.enum(["exploration", "raster-master", "raster-seed"]),
        requiresHumanReview: z.boolean(),
        requiresVectorization: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .superRefine((task, ctx) => {
    const seed = task.kind === "brand-logo-seed" || task.kind === "icon-seed";
    if (
      seed &&
      (task.publication.intendedUse !== "raster-seed" ||
        !task.publication.requiresVectorization ||
        !task.publication.requiresHumanReview)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["publication"],
        message:
          "Logo and icon generation may only produce a raster seed requiring vectorization and human review.",
      });
    }
    if (task.consistency.serial !== undefined && !task.consistency.seriesId) {
      ctx.addIssue({
        code: "custom",
        path: ["consistency", "seriesId"],
        message: "Serial consistency requires a seriesId.",
      });
    }
    if (
      task.refinement.mode === "local-mask" &&
      !task.references.some((reference) => reference.role === "mask")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["references"],
        message: "Local repaint requires an immutable mask reference.",
      });
    }
  });
export type VisualGenerationTask = z.infer<typeof visualGenerationTaskSchema>;

export const variantCandidateSchema = z
  .object({
    variantId: id,
    artifactId: id,
    sha256,
    mediaType: z.string().regex(/^image\//),
    requestId: id,
    model: id,
    providerId: id,
    attempt: z.number().int().positive(),
    provenanceId: id,
  })
  .strict();
export type VariantCandidate = z.infer<typeof variantCandidateSchema>;

export const reviewGateSchema = z
  .object({
    version: z.literal("visual-review-gate.v1"),
    gateId: id,
    taskId: id,
    stage: z.enum([
      "variant-selection",
      "edit-review",
      "vector-review",
      "master-approval",
    ]),
    status: z.enum(["pending", "approved", "rejected"]),
    candidateIds: z.array(id).min(1),
    selectedCandidateId: id.optional(),
    reviewer: z.enum(["agent", "human", "deterministic-check"]),
    criteria: z.array(text).min(1),
    evidence: z.array(text).default([]),
    decidedAt: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((gate, ctx) => {
    if (gate.status === "approved" && !gate.selectedCandidateId)
      ctx.addIssue({
        code: "custom",
        path: ["selectedCandidateId"],
        message: "An approved review gate must select a candidate.",
      });
    if (
      gate.selectedCandidateId &&
      !gate.candidateIds.includes(gate.selectedCandidateId)
    )
      ctx.addIssue({
        code: "custom",
        path: ["selectedCandidateId"],
        message: "The selected candidate must be reviewed by this gate.",
      });
  });
export type ReviewGate = z.infer<typeof reviewGateSchema>;

export const promotionReceiptSchema = z
  .object({
    version: z.literal("visual-promotion-receipt.v1"),
    receiptId: id,
    taskId: id,
    catalogItemId: id,
    masterArtifactId: id,
    sourceCandidateId: id,
    gateIds: z.array(id).min(1),
    status: z.enum(["approved-master", "raster-seed-awaiting-vector-review"]),
    promotedAt: z.number().int().nonnegative(),
    provenanceIds: z.array(id).min(1),
  })
  .strict();
export type PromotionReceipt = z.infer<typeof promotionReceiptSchema>;

export const visualDagNodeSchema = z.discriminatedUnion("operation", [
  z
    .object({
      id,
      operation: z.literal("generate"),
      inputs: z.array(id),
      variantIndex: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({ id, operation: z.literal("select"), inputs: z.array(id).min(1) })
    .strict(),
  z
    .object({
      id,
      operation: z.literal("edit"),
      inputs: z.array(id).min(1),
      editPrompt: text,
    })
    .strict(),
  z
    .object({
      id,
      operation: z.literal("review"),
      inputs: z.array(id).min(1),
      stage: z.enum(["edit-review", "vector-review", "master-approval"]),
    })
    .strict(),
  z
    .object({ id, operation: z.literal("promote"), inputs: z.array(id).min(1) })
    .strict(),
]);
export type VisualDagNode = z.infer<typeof visualDagNodeSchema>;

export const visualGenerationPlanSchema = z
  .object({
    version: z.literal("visual-generation-plan.v1"),
    planId: id,
    task: visualGenerationTaskSchema,
    nodes: z.array(visualDagNodeSchema).min(3),
    estimatedCost: moneyEstimateSchema,
    idempotencyKey: id,
  })
  .strict();
export type VisualGenerationPlan = z.infer<typeof visualGenerationPlanSchema>;
