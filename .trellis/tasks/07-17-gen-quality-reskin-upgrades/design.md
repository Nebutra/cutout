# Design — Generation quality: reskin-pipeline upgrades

## Scope decision

This task implements G1 (text discipline), G3 (component-grade constraints), and G2 (vision QA reject/retry with lesson feedback). G4 (chroma-key) is deferred: background detection (`isBackgroundPixel`: `r,g,b >= threshold`) is a white-background assumption threaded through all of `src/algorithm/**` and its UI params — a separate child task. G5 (hard DESIGN.md gate) is deferred with it.

## 1. Prompt hardening (G1 + G3) — pure string changes

### `src/prototype/generate-suite.ts`

- `prototypePagePrompt` Rules line gains a **text-discipline block**:
  - Render only short, real labels that come from the plan (page name, region names, interaction source elements); never invent paragraph copy.
  - Long text content must appear as abstract placeholder bars/blocks (the competitor's "runtime overlay" principle adapted to image prototypes).
  - Hard negatives: no pseudo-text/lorem walls, no duplicated glyphs, no melted/garbled characters; if a text area cannot be rendered crisply, use a placeholder bar instead.
- `prototypePagePrompt` region lines gain **per-region hard constraints** (G3): each region rendered exactly once, no duplicate regions, no extra invented regions; region states implied by interactions listed explicitly.
- `prototypeDesignSystemPrompt` gains the same text-discipline negatives (specimen text allowed only as short single-line samples).

### `src/prototype/region-deconstruct.ts`

`regionBoardPrompt` currently lacks two rules the catalog deconstruction prompt has; add:
- Text exclusion: no text/labels/numerals baked into assets (runtime overlay principle).
- White/light foreground safety: white-ish assets need a visible closed contour so white-background cutout doesn't fuse them with the canvas.

## 2. Vision QA gate (G2) — new pure module + DI wiring

### New: `src/prototype/generation-qa.ts`

Pure, dependency-injected, mirroring `region-deconstruct.ts` conventions:

- `buildPageChecklist(plan, page): string[]` / `buildBoardChecklist(page, region): string[]` — deterministic checklist derived from plan (all planned regions present; no pseudo-text walls; no device bezel/annotations/asset-sheet on pages; board: assets separated on continuous white, no text, no region bleed).
- `reviewImage(deps, {imageBytes, checklist, signal}): Promise<QaVerdict>` — one vision call (`generateObject`-style via injected `review` fn) returning `{ pass: boolean, failures: string[] }`. Zod-validated.
- `qaRetryPrompt(basePrompt, failures): string` — appends a `Previous attempt was rejected for these reasons — you MUST fix all of them:` block (the lesson-feedback mechanism).
- `generateWithQa(generate, review, {basePrompt, maxRetries=2, onVerdict}): Promise<{bytes, verdict, attempts}>` — bounded reject/re-roll loop; returns the last attempt even if still failing (never blocks the pipeline), with verdict attached so callers can surface it.

### Wiring

- `runRegionBreakdown` gains an optional `reviewBoard?` dep; when present, each region board goes through `generateWithQa` (existing generation call becomes the `generate` thunk). Failure reasons stream via existing `onRegionError`-style callback (new optional `onRegionQa`).
- Page generation (`generatePagesSerial` in `IntentWorkspace.tsx`) wraps its image call in `generateWithQa` with `buildPageChecklist`, review model = the chat/vision model already used for slice naming. A single flag `qaEnabled` (default on, threaded from the call site) short-circuits to the old behavior.

Cost control: max 2 retries per image, QA pass is a cheap vision-text call; disabled ⇒ zero extra calls.

## 3. Testing

- Unit: checklist builders, `qaRetryPrompt`, `generateWithQa` loop (pass-first-try / fail-then-pass / fail-all with capped attempts) with stubbed generate/review; prompt snapshot updates for `generate-suite` and `region-deconstruct` existing tests.
- Type-check: `npx tsc --noEmit -p tsconfig.app.json`; test runner: existing vitest setup.

## Rollback

All changes additive: QA gate is DI-optional and flag-gated; prompt edits are text-only. Revert = remove the wiring lines + restore prompt strings.
