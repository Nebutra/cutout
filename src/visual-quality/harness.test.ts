import { describe, expect, it } from "vitest";
import type { PixelFrame } from "../algorithm/types";
import {
  cleanBackgroundReceiptSchema,
  visualAssetHarnessReceiptSchema,
} from "./contracts";
import {
  applyDynamicKey,
  chooseDynamicKey,
  compareRecomposition,
  evaluateTransparency,
  perceptualDistance,
  planTransparency,
  recompose,
  verifyCleanBackground,
} from "./harness";

const hash = (char: string) => char.repeat(64);
function frame(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): PixelFrame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4);
  return { width, height, data };
}
function set(
  target: PixelFrame,
  x: number,
  y: number,
  rgba: [number, number, number, number],
) {
  target.data.set(rgba, (y * target.width + x) * 4);
}

describe("visual asset quality harness", () => {
  it("uses OKLab distance and selects a deterministic key away from asset colors", () => {
    expect(
      perceptualDistance({ r: 255, g: 0, b: 255 }, { r: 255, g: 0, b: 254 }),
    ).toBeLessThan(
      perceptualDistance({ r: 255, g: 0, b: 255 }, { r: 0, g: 255, b: 0 }),
    );
    const source = frame(4, 4, [255, 0, 255, 255]);
    const choice = chooseDynamicKey(source);
    expect(choice.key).not.toMatchObject({ r: 255, g: 0, b: 255 });
    expect(chooseDynamicKey(source)).toEqual(choice);
  });

  it("plans native alpha first, then declared matting, then dynamic-key fallback", () => {
    expect(
      planTransparency({
        sourceArtifactId: "source",
        frame: frame(2, 2, [1, 2, 3, 0]),
      }).strategy,
    ).toBe("native-alpha");
    expect(
      planTransparency({
        sourceArtifactId: "source",
        frame: frame(2, 2, [1, 2, 3, 255]),
        matting: {
          executor: "matte.host",
          capability: "matting",
          maskArtifactId: "mask",
        },
      }),
    ).toEqual({
      strategy: "matting",
      sourceArtifactId: "source",
      executor: "matte.host",
      capability: "matting",
      maskArtifactId: "mask",
    });
    expect(
      planTransparency({
        sourceArtifactId: "source",
        frame: frame(2, 2, [1, 2, 3, 255]),
      }).strategy,
    ).toBe("dynamic-key");
  });

  it("turns a dynamic key into soft alpha and decontaminates keyed edges", () => {
    const keyed = frame(3, 1, [255, 0, 255, 255]);
    set(keyed, 1, 0, [200, 20, 200, 255]);
    set(keyed, 2, 0, [20, 40, 80, 255]);
    const result = applyDynamicKey(keyed, {
      r: 255,
      g: 0,
      b: 255,
      a: 255,
    });
    expect(result.data[3]).toBe(0);
    expect(result.data[7]).toBeGreaterThan(0);
    expect(result.data[7]).toBeLessThan(255);
    expect(result.data[11]).toBe(255);
    expect(result.data[4]).toBeLessThan(200);
    expect(result.data[6]).toBeLessThan(200);
    expect(keyed.data[3]).toBe(255);
  });

  it("fails empty, edge-touching and key-spilled alpha instead of calling it complete", () => {
    const empty = evaluateTransparency({
      sourceArtifactId: "source",
      outputArtifactId: "out",
      strategy: "native-alpha",
      frame: frame(4, 4, [0, 0, 0, 0]),
      sourceSha256: hash("a"),
      outputSha256: hash("b"),
      provenanceId: "prov",
    });
    expect(empty).toMatchObject({
      status: "failed",
      gates: { nonempty: false },
    });
    const touching = frame(4, 4, [0, 0, 0, 0]);
    set(touching, 0, 1, [255, 0, 255, 255]);
    set(touching, 1, 1, [255, 0, 255, 128]);
    const receipt = evaluateTransparency({
      sourceArtifactId: "source",
      outputArtifactId: "out",
      strategy: "dynamic-key",
      frame: touching,
      key: { r: 255, g: 0, b: 255, a: 255 },
      sourceSha256: hash("a"),
      outputSha256: hash("b"),
      provenanceId: "prov",
    });
    expect(receipt).toMatchObject({
      status: "failed",
      gates: { padding: false, halo: false, spill: false },
      measurements: { bounds: { x: 0, y: 1, width: 2, height: 1 } },
    });
  });

  it("accepts measured alpha with occupancy, padding, bounds, halo and spill evidence", () => {
    const cut = frame(5, 5, [0, 0, 0, 0]);
    for (let y = 1; y < 4; y++)
      for (let x = 1; x < 4; x++) set(cut, x, y, [20, 40, 80, 255]);
    const receipt = evaluateTransparency({
      sourceArtifactId: "source",
      outputArtifactId: "out",
      strategy: "dynamic-key",
      frame: cut,
      key: { r: 255, g: 0, b: 255, a: 255 },
      sourceSha256: hash("a"),
      outputSha256: hash("b"),
      provenanceId: "prov",
    });
    expect(receipt).toMatchObject({
      status: "passed",
      measurements: {
        alphaOccupancy: 9 / 25,
        padding: { top: 1, right: 1, bottom: 1, left: 1 },
        bounds: { x: 1, y: 1, width: 3, height: 3 },
      },
    });
  });

  it("requires masked inpaint evidence and rejects source copies or broad outside changes", () => {
    const source = frame(3, 3, [10, 10, 10, 255]),
      output = frame(3, 3, [10, 10, 10, 255]),
      mask = new Uint8Array(9);
    mask[4] = 1;
    set(output, 1, 1, [20, 20, 20, 255]);
    const request = {
      protocol: "cutout.clean-background-request.v1" as const,
      sourceArtifactId: "source",
      sourceSha256: hash("a"),
      maskArtifactId: "mask",
      maskSha256: hash("b"),
      operation: "masked-inpaint" as const,
      executorCapability: "image-edit" as const,
      dilationPx: 2,
      featherPx: 1,
      provenanceId: "prov",
    };
    expect(
      verifyCleanBackground({
        protocol: "cutout.clean-background-receipt.v1",
        request,
        outputArtifactId: "clean",
        outputSha256: hash("c"),
        executor: "image.host",
        method: "masked-inpaint",
        source,
        output,
        mask,
      }),
    ).toMatchObject({
      status: "passed",
      changedMaskedPixels: 1,
      unchangedOutsideMaskRatio: 1,
    });
    expect(() =>
      cleanBackgroundReceiptSchema.parse({
        protocol: "cutout.clean-background-receipt.v1",
        request,
        outputArtifactId: "copy",
        outputSha256: hash("a"),
        executor: "blur",
        method: "masked-inpaint",
        changedMaskedPixels: 1,
        unchangedOutsideMaskRatio: 1,
        status: "passed",
      }),
    ).toThrow(/copied source/);
    const damaged = frame(3, 3, [200, 200, 200, 255]);
    set(damaged, 1, 1, [20, 20, 20, 255]);
    expect(
      verifyCleanBackground({
        protocol: "cutout.clean-background-receipt.v1",
        request,
        outputArtifactId: "clean",
        outputSha256: hash("d"),
        executor: "image.host",
        method: "masked-inpaint",
        source,
        output: damaged,
        mask,
      }).status,
    ).toBe("failed");
  });

  it("performs real alpha recomposition and reports exact and mismatched pixels", () => {
    const layer = frame(1, 1, [255, 0, 0, 128]),
      composed = recompose(2, 2, { r: 0, g: 0, b: 0, a: 255 }, [
        { artifactId: "layer", frame: layer, x: 1, y: 1 },
      ]);
    expect([...composed.data.slice(12, 16)]).toEqual([128, 0, 0, 255]);
    const exact = compareRecomposition({
      referenceArtifactId: "ref",
      recomposedArtifactId: "render",
      reference: composed,
      recomposed: composed,
      referenceSha256: hash("a"),
      recomposedSha256: hash("a"),
      layerArtifactIds: ["layer"],
      provenanceId: "prov",
    });
    expect(exact).toMatchObject({
      status: "passed",
      measurements: { differingPixels: 0, exactPixelRatio: 1 },
    });
    const wrong = frame(2, 2, [0, 0, 0, 255]);
    const diff = compareRecomposition({
      referenceArtifactId: "ref",
      recomposedArtifactId: "render",
      reference: composed,
      recomposed: wrong,
      referenceSha256: hash("a"),
      recomposedSha256: hash("b"),
      layerArtifactIds: ["layer"],
      provenanceId: "prov",
    });
    expect(diff).toMatchObject({
      status: "failed",
      measurements: { differingPixels: 1, exactPixelRatio: 0.75 },
    });
  });

  it("binds a successful harness receipt to Design IR, material revision and every provenance stage", () => {
    const cut = frame(3, 3, [0, 0, 0, 0]);
    set(cut, 1, 1, [20, 40, 80, 255]);
    const alpha = evaluateTransparency({
      sourceArtifactId: "source",
      outputArtifactId: "cut",
      strategy: "native-alpha",
      frame: cut,
      sourceSha256: hash("a"),
      outputSha256: hash("b"),
      provenanceId: "prov.alpha",
    });
    const source = frame(3, 3, [10, 10, 10, 255]);
    const clean = frame(3, 3, [10, 10, 10, 255]);
    set(clean, 1, 1, [20, 20, 20, 255]);
    const mask = new Uint8Array(9);
    mask[4] = 1;
    const cleanBackground = verifyCleanBackground({
      protocol: "cutout.clean-background-receipt.v1",
      request: {
        protocol: "cutout.clean-background-request.v1",
        sourceArtifactId: "source",
        sourceSha256: hash("a"),
        maskArtifactId: "mask",
        maskSha256: hash("c"),
        operation: "masked-inpaint",
        executorCapability: "image-edit",
        dilationPx: 1,
        featherPx: 1,
        provenanceId: "prov.inpaint",
      },
      outputArtifactId: "clean",
      outputSha256: hash("d"),
      executor: "image.host",
      method: "masked-inpaint",
      source,
      output: clean,
      mask,
    });
    const recomposition = compareRecomposition({
      referenceArtifactId: "reference",
      recomposedArtifactId: "recomposed",
      reference: source,
      recomposed: source,
      referenceSha256: hash("a"),
      recomposedSha256: hash("a"),
      layerArtifactIds: ["cut"],
      provenanceId: "prov.recompose",
    });
    const receipt = {
      protocol: "cutout.visual-asset-harness.v1",
      designIr: {
        documentId: "design.document",
        revisionId: "revision.3",
        revisionNumber: 3,
      },
      material: {
        materialId: "material.hero",
        revisionId: "material-revision.2",
      },
      provenanceIds: ["prov.alpha", "prov.inpaint", "prov.recompose"],
      alpha,
      cleanBackground,
      recomposition,
      status: "passed",
    } as const;
    expect(visualAssetHarnessReceiptSchema.parse(receipt).status).toBe(
      "passed",
    );
    expect(() =>
      visualAssetHarnessReceiptSchema.parse({
        ...receipt,
        provenanceIds: ["prov.alpha"],
      }),
    ).toThrow(/Missing quality-stage provenance/);
  });
});
