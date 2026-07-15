import { z } from "zod";

export const CODING_TASK_VERSION = "cutout.coding-task.v1" as const;

const safeText = z
  .string()
  .min(1)
  .max(100_000)
  .refine(
    (value) =>
      !/(?:\b(?:sk|rk)-[A-Za-z0-9_-]{8,}\b|\bBearer\s+[A-Za-z0-9._~+/-]+\b)/i.test(
        value,
      ),
    "Credential-shaped values are not accepted.",
  );

export const codingRelativePathSchema = z
  .string()
  .min(1)
  .max(500)
  .refine((value) => {
    if (
      value.includes("\0") ||
      value.startsWith("/") ||
      value.startsWith("\\") ||
      /^[A-Za-z]:[\\/]/.test(value)
    )
      return false;
    return value
      .replaceAll("\\", "/")
      .split("/")
      .every((part) => part.length > 0 && part !== "." && part !== "..");
  }, "Expected a controlled relative path.")
  .refine(
    (value) =>
      !/(^|\/)(?:\.env(?:\.|$)|[^/]*(?:secret|credential|api[-_]?key|private[-_]?key|token)[^/]*)(?:\/|$)/i.test(
        value,
      ),
    "Credential-shaped paths are not accepted.",
  );

export const codingTaskSchema = z
  .object({
    version: z.literal(CODING_TASK_VERSION),
    taskId: z.string().regex(/^coding:[a-z0-9:._-]+$/),
    kind: z.enum(["execute", "review", "repair"]),
    goal: safeText.max(20_000),
    acceptanceCriteria: z.array(safeText.max(4_000)).min(1).max(100),
    repo: z
      .object({
        snapshotId: safeText.max(160),
        ref: safeText.max(300).optional(),
      })
      .strict(),
    inputs: z
      .object({
        designDocumentRef: safeText.max(300),
        brandKitRefs: z.array(safeText.max(300)).max(100),
        designKitRefs: z.array(safeText.max(300)).max(100),
        prototypeRefs: z.array(safeText.max(300)).max(100),
        imageAssetRefs: z.array(safeText.max(300)).max(1_000),
      })
      .strict(),
    target: z
      .object({
        stack: z.enum(["next-app-router", "vite-react", "existing-repository"]),
        packageManager: z.enum(["pnpm", "npm", "yarn", "bun"]),
      })
      .strict(),
    constraints: z
      .object({
        allowedPaths: z.array(codingRelativePathSchema).min(1).max(100),
        allowedCommands: z
          .array(z.enum(["typecheck", "test", "build", "lint", "visual-test"]))
          .max(5),
      })
      .strict(),
    expectedRevision: z.number().int().nonnegative(),
    budget: z
      .object({
        maxChangedFiles: z.number().int().min(1).max(2_000),
        maxBytes: z.number().int().min(1).max(20_000_000),
        maxDurationMs: z.number().int().min(1).max(3_600_000),
      })
      .strict(),
  })
  .strict();
export type CodingTask = z.infer<typeof codingTaskSchema>;

export const codingFilePatchSchema = z
  .object({
    path: codingRelativePathSchema,
    operation: z.enum(["create", "replace", "delete"]),
    contents: z.string().max(2_000_000).optional(),
    previousSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict()
  .superRefine((patch, context) => {
    if (patch.operation !== "delete" && patch.contents === undefined)
      context.addIssue({
        code: "custom",
        path: ["contents"],
        message: "File contents are required.",
      });
    if (patch.operation === "delete" && patch.contents !== undefined)
      context.addIssue({
        code: "custom",
        path: ["contents"],
        message: "Delete patches cannot include contents.",
      });
  });

export const codingPatchSchema = z
  .object({
    version: z.literal("cutout.coding-patch.v1"),
    taskId: z.string().min(1),
    baseSnapshotId: z.string().min(1),
    files: z.array(codingFilePatchSchema).min(1).max(2_000),
    rationale: safeText.max(20_000),
    provenance: z
      .object({
        backend: safeText.max(160),
        inputRefs: z.array(safeText.max(300)).max(2_000),
      })
      .strict(),
  })
  .strict();
export type CodingPatch = z.infer<typeof codingPatchSchema>;

const evidenceSchema = z
  .object({
    name: z.string().min(1),
    status: z.enum(["passed", "failed", "skipped"]),
    detail: z.string().max(10_000).optional(),
  })
  .strict();
export const codingReceiptSchema = z
  .object({
    version: z.literal("cutout.coding-receipt.v1"),
    receiptId: z.string().min(1),
    taskId: z.string().min(1),
    status: z.enum(["previewed", "applied", "failed", "cancelled"]),
    baseSnapshotId: z.string().min(1),
    resultSnapshotId: z.string().min(1).optional(),
    changedFiles: z.array(
      z
        .object({
          path: codingRelativePathSchema,
          sha256: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
          operation: z.enum(["create", "replace", "delete"]),
        })
        .strict(),
    ),
    checks: z.array(evidenceSchema),
    screenshots: z.array(
      z
        .object({
          artifactRef: z.string().min(1),
          viewport: z.string().min(1),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    ),
    provenance: z
      .object({
        backend: z.string().min(1),
        inputRefs: z.array(z.string()),
        patchSha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    startedAt: z.number().int().nonnegative(),
    completedAt: z.number().int().nonnegative(),
    detail: z.string().optional(),
  })
  .strict();
export type CodingReceipt = z.infer<typeof codingReceiptSchema>;
