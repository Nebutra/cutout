import type { PixelFrame } from "../algorithm/types";
import {
  cleanBackgroundReceiptSchema,
  recompositionReportSchema,
  transparencyQualityReceiptSchema,
  type CleanBackgroundReceipt,
  type PixelBounds,
  type Rgba,
  type TransparencyPlan,
  type TransparencyQualityReceipt,
} from "./contracts";

type Lab = readonly [number, number, number];
const linear = (n: number) => {
  n /= 255;
  return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
};
export function rgbToOklab(color: Pick<Rgba, "r" | "g" | "b">): Lab {
  const r = linear(color.r),
    g = linear(color.g),
    b = linear(color.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
    m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
export function perceptualDistance(
  a: Pick<Rgba, "r" | "g" | "b">,
  b: Pick<Rgba, "r" | "g" | "b">,
) {
  const x = rgbToOklab(a),
    y = rgbToOklab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

const KEY_CANDIDATES: Rgba[] = [
  { r: 255, g: 0, b: 255, a: 255 },
  { r: 0, g: 255, b: 255, a: 255 },
  { r: 0, g: 255, b: 0, a: 255 },
  { r: 255, g: 255, b: 0, a: 255 },
  { r: 0, g: 0, b: 255, a: 255 },
  { r: 255, g: 0, b: 0, a: 255 },
];
export function chooseDynamicKey(frame: PixelFrame): {
  key: Rgba;
  perceptualClearance: number;
} {
  const samples: Rgba[] = [];
  const stride = Math.max(1, Math.floor((frame.width * frame.height) / 4096));
  for (let i = 0; i < frame.width * frame.height; i += stride) {
    const o = i * 4;
    if (frame.data[o + 3] >= 16)
      samples.push({
        r: frame.data[o],
        g: frame.data[o + 1],
        b: frame.data[o + 2],
        a: frame.data[o + 3],
      });
  }
  const ranked = KEY_CANDIDATES.map((key, index) => ({
    key,
    index,
    clearance: samples.length
      ? Math.min(...samples.map((sample) => perceptualDistance(key, sample)))
      : 1,
  })).sort((a, b) => b.clearance - a.clearance || a.index - b.index);
  return { key: ranked[0].key, perceptualClearance: ranked[0].clearance };
}

export function planTransparency(input: {
  sourceArtifactId: string;
  frame: PixelFrame;
  matting?: {
    executor: string;
    capability: "matting" | "segmentation";
    maskArtifactId: string;
  };
}): TransparencyPlan {
  let transparent = 0;
  for (let i = 3; i < input.frame.data.length; i += 4)
    if (input.frame.data[i] < 255) transparent++;
  if (transparent > 0)
    return {
      strategy: "native-alpha",
      sourceArtifactId: input.sourceArtifactId,
    };
  if (input.matting)
    return {
      strategy: "matting",
      sourceArtifactId: input.sourceArtifactId,
      ...input.matting,
    };
  const selected = chooseDynamicKey(input.frame);
  return {
    strategy: "dynamic-key",
    sourceArtifactId: input.sourceArtifactId,
    ...selected,
  };
}

export function applyDynamicKey(
  frame: PixelFrame,
  key: Rgba,
  thresholds: { inner: number; outer: number } = { inner: 0.035, outer: 0.16 },
): PixelFrame {
  if (!(thresholds.inner >= 0 && thresholds.outer > thresholds.inner))
    throw new Error("Dynamic key thresholds require 0 <= inner < outer.");
  const data = new Uint8ClampedArray(frame.data);
  const keyChannels = [key.r, key.g, key.b];
  for (let offset = 0; offset < data.length; offset += 4) {
    const distance = perceptualDistance(
      { r: data[offset], g: data[offset + 1], b: data[offset + 2] },
      key,
    );
    const linear = Math.min(
      1,
      Math.max(
        0,
        (distance - thresholds.inner) / (thresholds.outer - thresholds.inner),
      ),
    );
    const matte = linear * linear * (3 - 2 * linear);
    const alpha = (data[offset + 3] / 255) * matte;
    if (alpha <= 0.001) {
      data.fill(0, offset, offset + 4);
      continue;
    }
    if (matte < 0.999)
      for (let channel = 0; channel < 3; channel += 1) {
        const source = data[offset + channel] / 255;
        const keyChannel = keyChannels[channel] / 255;
        data[offset + channel] = Math.round(
          Math.min(
            1,
            Math.max(0, (source - keyChannel * (1 - matte)) / matte),
          ) * 255,
        );
      }
    data[offset + 3] = Math.round(alpha * 255);
  }
  return { width: frame.width, height: frame.height, data };
}

function foregroundBounds(frame: PixelFrame, alpha = 8): PixelBounds | null {
  let minX = frame.width,
    minY = frame.height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < frame.height; y++)
    for (let x = 0; x < frame.width; x++)
      if (frame.data[(y * frame.width + x) * 4 + 3] >= alpha) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
  return maxX < 0
    ? null
    : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
export function measureTransparency(input: {
  frame: PixelFrame;
  key?: Rgba;
  haloDistance?: number;
  spillDistance?: number;
}) {
  const { frame } = input,
    total = frame.width * frame.height,
    bounds = foregroundBounds(frame);
  let occupied = 0,
    partial = 0,
    halo = 0,
    spill = 0,
    edge = 0;
  for (let i = 0; i < total; i++) {
    const o = i * 4,
      a = frame.data[o + 3];
    if (a >= 8) occupied++;
    if (a > 0 && a < 255) partial++;
    if (a > 0 && a < 250) {
      edge++;
      const pixel = {
        r: frame.data[o],
        g: frame.data[o + 1],
        b: frame.data[o + 2],
      };
      if (
        input.key &&
        perceptualDistance(pixel, input.key) < (input.haloDistance ?? 0.12)
      )
        halo++;
    }
    if (
      a >= 8 &&
      input.key &&
      perceptualDistance(
        { r: frame.data[o], g: frame.data[o + 1], b: frame.data[o + 2] },
        input.key,
      ) < (input.spillDistance ?? 0.08)
    )
      spill++;
  }
  const padding = bounds
    ? {
        top: bounds.y,
        left: bounds.x,
        right: frame.width - (bounds.x + bounds.width),
        bottom: frame.height - (bounds.y + bounds.height),
      }
    : { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    alphaOccupancy: occupied / total,
    partialAlphaRatio: partial / total,
    edgeHaloRatio: edge ? halo / edge : 0,
    keySpillRatio: occupied ? spill / occupied : 0,
    padding,
    bounds,
  };
}
export function evaluateTransparency(input: {
  sourceArtifactId: string;
  outputArtifactId: string;
  strategy: TransparencyPlan["strategy"];
  frame: PixelFrame;
  key?: Rgba;
  sourceSha256: string;
  outputSha256: string;
  maskSha256?: string;
  provenanceId: string;
  policy?: {
    minOccupancy?: number;
    maxOccupancy?: number;
    maxHalo?: number;
    maxSpill?: number;
    minPadding?: number;
  };
}): TransparencyQualityReceipt {
  const m = measureTransparency(input),
    p = {
      minOccupancy: 0.001,
      maxOccupancy: 0.98,
      maxHalo: 0.08,
      maxSpill: 0.01,
      minPadding: 1,
      ...input.policy,
    };
  const gates = {
    nonempty: m.bounds !== null,
    occupancy:
      m.alphaOccupancy >= p.minOccupancy && m.alphaOccupancy <= p.maxOccupancy,
    halo: m.edgeHaloRatio <= p.maxHalo,
    spill: m.keySpillRatio <= p.maxSpill,
    padding:
      Math.min(
        m.padding.top,
        m.padding.right,
        m.padding.bottom,
        m.padding.left,
      ) >= p.minPadding,
    bounds:
      !!m.bounds &&
      m.bounds.x + m.bounds.width <= input.frame.width &&
      m.bounds.y + m.bounds.height <= input.frame.height,
  };
  return transparencyQualityReceiptSchema.parse({
    protocol: "cutout.visual-alpha-quality.v1",
    sourceArtifactId: input.sourceArtifactId,
    outputArtifactId: input.outputArtifactId,
    strategy: input.strategy,
    measurements: m,
    gates,
    status: Object.values(gates).every(Boolean) ? "passed" : "failed",
    evidence: {
      sourceSha256: input.sourceSha256,
      outputSha256: input.outputSha256,
      ...(input.maskSha256 ? { maskSha256: input.maskSha256 } : {}),
      provenanceId: input.provenanceId,
    },
  });
}

export function verifyCleanBackground(
  input: Omit<
    CleanBackgroundReceipt,
    "changedMaskedPixels" | "unchangedOutsideMaskRatio" | "status"
  > & { source: PixelFrame; output: PixelFrame; mask: Uint8Array },
): CleanBackgroundReceipt {
  if (
    input.source.width !== input.output.width ||
    input.source.height !== input.output.height ||
    input.mask.length !== input.source.width * input.source.height
  )
    throw new Error("Clean background evidence dimensions do not match.");
  let inside = 0,
    changedInside = 0,
    outside = 0,
    unchangedOutside = 0;
  for (let i = 0; i < input.mask.length; i++) {
    let changed = false;
    for (let c = 0; c < 4; c++)
      if (input.source.data[i * 4 + c] !== input.output.data[i * 4 + c])
        changed = true;
    if (input.mask[i]) {
      inside++;
      if (changed) changedInside++;
    } else {
      outside++;
      if (!changed) unchangedOutside++;
    }
  }
  const ratio = outside ? unchangedOutside / outside : 1,
    status =
      inside > 0 && changedInside > 0 && ratio >= 0.98 ? "passed" : "failed";
  return cleanBackgroundReceiptSchema.parse({
    protocol: input.protocol,
    request: input.request,
    outputArtifactId: input.outputArtifactId,
    outputSha256: input.outputSha256,
    executor: input.executor,
    method: input.method,
    changedMaskedPixels: changedInside,
    unchangedOutsideMaskRatio: ratio,
    status,
  });
}

export type VisualLayer = {
  artifactId: string;
  frame: PixelFrame;
  x: number;
  y: number;
};
export function recompose(
  width: number,
  height: number,
  background: Rgba,
  layers: readonly VisualLayer[],
): PixelFrame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++)
    data.set([background.r, background.g, background.b, background.a], i * 4);
  for (const layer of layers)
    for (let sy = 0; sy < layer.frame.height; sy++)
      for (let sx = 0; sx < layer.frame.width; sx++) {
        const dx = layer.x + sx,
          dy = layer.y + sy;
        if (dx < 0 || dy < 0 || dx >= width || dy >= height) continue;
        const so = (sy * layer.frame.width + sx) * 4,
          doff = (dy * width + dx) * 4,
          sa = layer.frame.data[so + 3] / 255,
          da = data[doff + 3] / 255,
          outA = sa + da * (1 - sa);
        for (let c = 0; c < 3; c++)
          data[doff + c] = outA
            ? Math.round(
                (layer.frame.data[so + c] * sa +
                  data[doff + c] * da * (1 - sa)) /
                  outA,
              )
            : 0;
        data[doff + 3] = Math.round(outA * 255);
      }
  return { width, height, data };
}
export function compareRecomposition(input: {
  referenceArtifactId: string;
  recomposedArtifactId: string;
  reference: PixelFrame;
  recomposed: PixelFrame;
  referenceSha256: string;
  recomposedSha256: string;
  layerArtifactIds: string[];
  provenanceId: string;
  thresholds?: { minExactPixelRatio: number; maxMeanAbsoluteError: number };
}) {
  if (
    input.reference.width !== input.recomposed.width ||
    input.reference.height !== input.recomposed.height
  )
    throw new Error("Recomposition dimensions do not match the reference.");
  let differing = 0,
    sum = 0,
    max = 0;
  const pixels = input.reference.width * input.reference.height;
  for (let i = 0; i < pixels; i++) {
    let pixelDiff = false;
    for (let c = 0; c < 4; c++) {
      const d = Math.abs(
        input.reference.data[i * 4 + c] - input.recomposed.data[i * 4 + c],
      );
      sum += d;
      max = Math.max(max, d);
      if (d) pixelDiff = true;
    }
    if (pixelDiff) differing++;
  }
  const measurements = {
      differingPixels: differing,
      meanAbsoluteError: sum / (pixels * 4),
      maxChannelError: max,
      exactPixelRatio: 1 - differing / pixels,
    },
    thresholds = input.thresholds ?? {
      minExactPixelRatio: 0.99,
      maxMeanAbsoluteError: 1,
    },
    status =
      measurements.exactPixelRatio >= thresholds.minExactPixelRatio &&
      measurements.meanAbsoluteError <= thresholds.maxMeanAbsoluteError
        ? "passed"
        : "failed";
  return recompositionReportSchema.parse({
    protocol: "cutout.recomposition-report.v1",
    referenceArtifactId: input.referenceArtifactId,
    recomposedArtifactId: input.recomposedArtifactId,
    width: input.reference.width,
    height: input.reference.height,
    measurements,
    thresholds,
    status,
    evidence: {
      referenceSha256: input.referenceSha256,
      recomposedSha256: input.recomposedSha256,
      layerArtifactIds: input.layerArtifactIds,
      provenanceId: input.provenanceId,
    },
  });
}
