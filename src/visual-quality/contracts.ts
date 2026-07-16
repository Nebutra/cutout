import { z } from "zod";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const safeId = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const rgbaSchema = z
  .object({
    r: z.number().int().min(0).max(255),
    g: z.number().int().min(0).max(255),
    b: z.number().int().min(0).max(255),
    a: z.number().int().min(0).max(255),
  })
  .strict();
export type Rgba = z.infer<typeof rgbaSchema>;

export const pixelBoundsSchema = z
  .object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();
export type PixelBounds = z.infer<typeof pixelBoundsSchema>;

export const transparencyPlanSchema = z.discriminatedUnion("strategy", [
  z
    .object({ strategy: z.literal("native-alpha"), sourceArtifactId: safeId })
    .strict(),
  z
    .object({
      strategy: z.literal("matting"),
      sourceArtifactId: safeId,
      executor: safeId,
      capability: z.enum(["matting", "segmentation"]),
      maskArtifactId: safeId,
    })
    .strict(),
  z
    .object({
      strategy: z.literal("dynamic-key"),
      sourceArtifactId: safeId,
      key: rgbaSchema,
      perceptualClearance: z.number().nonnegative(),
    })
    .strict(),
]);
export type TransparencyPlan = z.infer<typeof transparencyPlanSchema>;

export const transparencyQualityReceiptSchema = z
  .object({
    protocol: z.literal("cutout.visual-alpha-quality.v1"),
    sourceArtifactId: safeId,
    outputArtifactId: safeId,
    strategy: z.enum(["native-alpha", "matting", "dynamic-key"]),
    measurements: z
      .object({
        alphaOccupancy: z.number().min(0).max(1),
        partialAlphaRatio: z.number().min(0).max(1),
        edgeHaloRatio: z.number().min(0).max(1),
        keySpillRatio: z.number().min(0).max(1),
        padding: z
          .object({
            top: z.number().int().nonnegative(),
            right: z.number().int().nonnegative(),
            bottom: z.number().int().nonnegative(),
            left: z.number().int().nonnegative(),
          })
          .strict(),
        bounds: pixelBoundsSchema.nullable(),
      })
      .strict(),
    gates: z
      .object({
        nonempty: z.boolean(),
        occupancy: z.boolean(),
        halo: z.boolean(),
        spill: z.boolean(),
        padding: z.boolean(),
        bounds: z.boolean(),
      })
      .strict(),
    status: z.enum(["passed", "failed"]),
    evidence: z
      .object({
        sourceSha256: sha256,
        outputSha256: sha256,
        maskSha256: sha256.optional(),
        provenanceId: safeId,
      })
      .strict(),
  })
  .strict()
  .superRefine((receipt, ctx) => {
    const passed = Object.values(receipt.gates).every(Boolean);
    if ((receipt.status === "passed") !== passed)
      ctx.addIssue({
        code: "custom",
        message: "Alpha quality status must equal the deterministic gates.",
      });
  });
export type TransparencyQualityReceipt = z.infer<
  typeof transparencyQualityReceiptSchema
>;

export const cleanBackgroundRequestSchema = z
  .object({
    protocol: z.literal("cutout.clean-background-request.v1"),
    sourceArtifactId: safeId,
    sourceSha256: sha256,
    maskArtifactId: safeId,
    maskSha256: sha256,
    operation: z.literal("masked-inpaint"),
    executorCapability: z.literal("image-edit"),
    dilationPx: z.number().int().min(0).max(256),
    featherPx: z.number().int().min(0).max(256),
    provenanceId: safeId,
  })
  .strict();
export type CleanBackgroundRequest = z.infer<
  typeof cleanBackgroundRequestSchema
>;

export const cleanBackgroundReceiptSchema = z
  .object({
    protocol: z.literal("cutout.clean-background-receipt.v1"),
    request: cleanBackgroundRequestSchema,
    outputArtifactId: safeId,
    outputSha256: sha256,
    executor: safeId,
    method: z.literal("masked-inpaint"),
    changedMaskedPixels: z.number().int().nonnegative(),
    unchangedOutsideMaskRatio: z.number().min(0).max(1),
    status: z.enum(["passed", "failed"]),
  })
  .strict()
  .superRefine((receipt, ctx) => {
    if (receipt.outputSha256 === receipt.request.sourceSha256)
      ctx.addIssue({
        code: "custom",
        message: "A copied source is not a clean background.",
      });
    if (receipt.status === "passed" && receipt.unchangedOutsideMaskRatio < 0.98)
      ctx.addIssue({
        code: "custom",
        message: "Inpaint changed too much content outside the approved mask.",
      });
    if (receipt.status === "passed" && receipt.changedMaskedPixels === 0)
      ctx.addIssue({
        code: "custom",
        message: "A successful inpaint must change pixels inside the mask.",
      });
  });
export type CleanBackgroundReceipt = z.infer<
  typeof cleanBackgroundReceiptSchema
>;

export const recompositionReportSchema = z
  .object({
    protocol: z.literal("cutout.recomposition-report.v1"),
    referenceArtifactId: safeId,
    recomposedArtifactId: safeId,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    measurements: z
      .object({
        differingPixels: z.number().int().nonnegative(),
        meanAbsoluteError: z.number().min(0).max(255),
        maxChannelError: z.number().int().min(0).max(255),
        exactPixelRatio: z.number().min(0).max(1),
      })
      .strict(),
    thresholds: z
      .object({
        minExactPixelRatio: z.number().min(0).max(1),
        maxMeanAbsoluteError: z.number().min(0).max(255),
      })
      .strict(),
    status: z.enum(["passed", "failed"]),
    evidence: z
      .object({
        referenceSha256: sha256,
        recomposedSha256: sha256,
        layerArtifactIds: z.array(safeId).min(1),
        provenanceId: safeId,
      })
      .strict(),
  })
  .strict()
  .superRefine((report, ctx) => {
    const passed =
      report.measurements.exactPixelRatio >=
        report.thresholds.minExactPixelRatio &&
      report.measurements.meanAbsoluteError <=
        report.thresholds.maxMeanAbsoluteError;
    if ((report.status === "passed") !== passed)
      ctx.addIssue({
        code: "custom",
        message: "Recomposition status must equal measured thresholds.",
      });
    if (
      report.evidence.referenceSha256 === report.evidence.recomposedSha256 &&
      report.measurements.differingPixels !== 0
    )
      ctx.addIssue({
        code: "custom",
        message: "Equal hashes cannot describe a non-exact comparison.",
      });
  });
export type RecompositionReport = z.infer<typeof recompositionReportSchema>;

export const visualAssetHarnessReceiptSchema = z
  .object({
    protocol: z.literal("cutout.visual-asset-harness.v1"),
    designIr: z
      .object({
        documentId: safeId,
        revisionId: safeId,
        revisionNumber: z.number().int().positive(),
      })
      .strict(),
    material: z.object({ materialId: safeId, revisionId: safeId }).strict(),
    provenanceIds: z.array(safeId).min(1),
    alpha: transparencyQualityReceiptSchema,
    cleanBackground: cleanBackgroundReceiptSchema,
    recomposition: recompositionReportSchema,
    status: z.enum(["passed", "failed"]),
  })
  .strict()
  .superRefine((receipt, ctx) => {
    const passed =
      receipt.alpha.status === "passed" &&
      receipt.cleanBackground.status === "passed" &&
      receipt.recomposition.status === "passed";
    if ((receipt.status === "passed") !== passed)
      ctx.addIssue({
        code: "custom",
        message:
          "Visual asset harness status must equal all deterministic quality stages.",
      });
    const evidence = new Set(receipt.provenanceIds);
    for (const id of [
      receipt.alpha.evidence.provenanceId,
      receipt.cleanBackground.request.provenanceId,
      receipt.recomposition.evidence.provenanceId,
    ])
      if (!evidence.has(id))
        ctx.addIssue({
          code: "custom",
          path: ["provenanceIds"],
          message: `Missing quality-stage provenance ${id}.`,
        });
  });
export type VisualAssetHarnessReceipt = z.infer<
  typeof visualAssetHarnessReceiptSchema
>;
