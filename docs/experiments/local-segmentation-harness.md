# Local Segmentation Harness Notes

Cutoff: model families available by roughly June/July 2024.

## Goal

Cutout needs a local segmentation harness for asset extraction, not a generic
object detector. The harness should produce masks that can be traced back to the
source prototype/page/region, while the planner decides which visual layers are
worth extracting.

This keeps the first-principles split clean:

- Planner/vision reasoning decides semantic value: product object, artwork,
  avatar, badge, hero/banner art, or premium material layer.
- Local segmenter produces candidate masks and precise edges.
- CV filters reject cheap UI chrome: cards, skeletons, forms, nav, price rows.
- Every accepted asset stores provenance: source image id, region id, mask id,
  bounding box, and generation/deconstruction step id.

## Candidates

### EdgeSAM

Best first integration target.

- Source: https://arxiv.org/abs/2312.06660
- Why: designed for edge devices, prompt-in-the-loop distillation, reported
  37x speedup over original SAM and 30+ FPS on iPhone 14.
- Fit: good for box/point prompted masks after the planner or CV step proposes
  candidate targets. This is the closest match to "local laptop, no API".
- Risk: still needs model packaging and ONNX/CoreML validation.

### MobileSAM

Strong fallback and easiest SAM-family mental model.

- Source: https://arxiv.org/abs/2306.14289
- Project: https://github.com/chaoningzhang/mobilesam
- Why: replaces SAM's heavy encoder with TinyViT, preserving promptable SAM
  behavior. Good for local box/point prompts.
- Fit: useful if EdgeSAM packaging is harder than expected.
- Risk: mask quality can be weaker than heavier SAM variants on fine details.

### EfficientSAM-Ti

Good browser/Tauri candidate because ONNX examples exist.

- Source: https://arxiv.org/html/2312.00863v1
- Project: https://github.com/yformer/EfficientSAM
- ONNX example: https://huggingface.co/opencv/image_segmentation_efficientsam
- Why: lightweight SAM model with EfficientSAM-Ti ONNX variants.
- Fit: useful for a Tauri frontend-side or sidecar-side prototype.
- Risk: some public ONNX demos support limited prompt modes; verify box prompts
  before committing.

### FastSAM

Useful as an all-instance candidate generator, less ideal as final mask source.

- Source: https://arxiv.org/abs/2306.12156
- Project: https://github.com/CASIA-LMC-Lab/FastSAM
- Docs: https://docs.ultralytics.com/models/fast-sam
- Why: CNN/YOLOv8-seg based, real-time, produces many instance masks.
- Fit: can propose masks when the board contains many objects.
- Risk: AGPL project licensing and "detect all instances" behavior may over-pick
  UI chrome. Treat as optional, not the default embedded engine.

### HQ-SAM

Quality reference, not the laptop-default engine.

- Source: https://arxiv.org/abs/2306.01567
- Project: https://github.com/SysCV/sam-hq
- Why: improves fine mask quality for intricate objects.
- Fit: useful benchmark for edge quality, or optional advanced mode.
- Risk: still depends on SAM-class weight/runtime assumptions.

## Recommended Cutout Architecture

Start with a model-agnostic interface:

```ts
interface SegmentMaskCandidate {
  id: string
  sourceImageId: string
  sourceRegionId?: string
  box: { x: number; y: number; width: number; height: number }
  mask: ImageData | Uint8Array
  score?: number
  prompt: { kind: 'box' | 'point' | 'auto'; value: unknown }
  provenance: {
    plannerStepId?: string
    prototypePageId?: string
    prototypeRegionId?: string
    algorithm: 'cv' | 'edgesam' | 'mobilesam' | 'efficientsam' | 'fastsam'
  }
}
```

Use the local model in two modes:

1. **Refine**: current CV pipeline proposes boxes; EdgeSAM/MobileSAM/EfficientSAM
   converts each box into a tighter mask. This directly addresses clipped plush,
   notebook+pen, and hero/banner edge quality.
2. **Discover**: model proposes masks inside a prototype region crop. The planner
   and UI-container filter decide which masks become assets. This helps when the
   image model packs many products into one area.

Do not use local segmentation as the final source of truth for asset value. A
segmentation model sees shapes, not product intent. The planner still decides
whether a mask is an art asset, a product object, a material layer, or cheap UI.

## Implementation Order

1. Ship the current CV fix: foreground-island split plus UI-container filter.
2. Add the typed segmentation interface and provenance schema.
3. Prototype EfficientSAM-Ti ONNX or MobileSAM ONNX in a sidecar experiment.
4. If ONNX/browser packaging is unstable, switch first target to EdgeSAM via a
   local sidecar process and keep the same TypeScript interface.
5. Add a debug overlay that shows source prototype region -> mask -> output
   asset, so slicing is bidirectionally traceable.

