# Semantic Slice Generation Experiment

## Goal

Avoid making the asset board the only path. The current board pipeline is still useful because it is deterministic after the image is generated, but it can merge multiple intended assets when the generated board places elements too close together or connects them with shadows, antialiasing, labels, or overlapping colors.

This experiment tests a second path:

1. Use a multimodal reasoning model to read the brief and optional mockup/proto image.
2. Produce a structured `semantic-slices.v0` plan before any asset sheet is generated.
3. Generate each slice as its own transparent PNG from the structured spec.
4. Optionally run an image-to-image route using the mockup/proto as style reference.
5. Validate each generated slice with a vision model and mark it as `pass`, `retry`, or `reject`.

The module is deliberately not wired into the main UI yet. It lives behind tests so we can compare quality and cost before changing the user workflow.

## Paths To Compare

### A. Board-first

Brief or mockup -> asset board -> CV cutout -> optional vision naming.

Strengths:
- Fast deterministic slicing once the board exists.
- Good when the image model obeys spacing rules.
- Produces many assets in one image call.

Risks:
- Adjacent assets can fuse into one component.
- Board generation spends tokens/pixels on layout instead of asset quality.
- CV parameters such as threshold, merge gap, and padding become product behavior.

### B. Semantic single-slice

Brief or mockup -> structured slice plan -> one image call per slice -> vision QA.

Strengths:
- No connected-component split is required.
- Each asset spec is inspectable and retryable.
- Lets the planner decide priority, target size, and asset role before generation.

Risks:
- More image calls.
- Style coherence must be maintained through shared style context.
- Needs validation to catch missing transparency or multi-subject outputs.

### C. Img2img single-slice

Brief or mockup -> structured slice plan -> image edit per slice using the mockup/proto as reference -> vision QA.

Strengths:
- Better style continuity than pure text-to-image.
- Useful for repairing one failed slice without regenerating the full board.
- Can be crossed with board output: use a failed board crop as reference, but ask the model to regenerate exactly one clean asset.

Risks:
- Requires an image edit-capable provider.
- Must explicitly forbid crop/copy behavior.
- Reference conditioning can leak unwanted neighboring UI unless the prompt is strict.

## Crossed Flows

- A -> B: generate a board, detect suspicious merged components, ask the semantic planner to split that component into multiple specs.
- B -> C: plan semantic specs first, then choose img2img only for high-value assets needing stronger style fidelity.
- C -> A: generate high-quality single assets, then compose them into a board only for export/review.
- ABC parallel: run board-first and semantic single-slice on the same intent, compare count, QA verdicts, and user-selected exports.
- BCA: plan specs, generate reference-conditioned slices, then compose a clean board from accepted outputs for batch management.

## Evaluation Signals

- Single-subject rate: how many outputs contain exactly one asset.
- Transparency rate: how many outputs are export-ready without background removal.
- Style consistency: whether slices look like one UI kit.
- Retry cost: how many retry loops are needed per accepted asset.
- User workload: how many manual renames, deletes, or recuts are needed.
- Agent workload: whether the structured plan gives enough machine-readable control to retry and repair without user involvement.

## Current Implementation

Code:
- `src/services/ai/semantic-slices.ts`
- `src/services/ai/semantic-slices.test.ts`
- `src/hooks/useAiNativeControl.ts`
- `scripts/cutout-ai.mjs`

The test module mocks:
- GPT-5.5-style structured planning through `generateObject`.
- GPT Image 2-style direct generation through `generateImages`.
- GPT Image 2-style img2img through `editImage`.
- Vision QA through `generateObject`.

Run:

```sh
pnpm test -- src/services/ai/semantic-slices.test.ts
pnpm ai semantic-plan "政府官网"
pnpm ai semantic-slices '{"brief":"政府官网","maxSlices":6,"routes":["text-to-image","image-to-image"]}'
```

## Integration Criteria

Do not place this in the visible UX until live evals show:

- Semantic single-slice has a clearly higher single-subject rate than board cutout for dense boards.
- Img2img improves style continuity without copying unwanted neighboring UI.
- The structured plan is stable enough for AI Native control and can be serialized as JSON.
- A failed output can be retried using only spec + validation feedback, without asking the user to tune thresholds.
