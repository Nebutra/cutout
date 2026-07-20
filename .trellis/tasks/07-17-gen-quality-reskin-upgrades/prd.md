# PRD — Generation quality: reskin-pipeline upgrades

## Background

Competitive analysis of 陶泥儿 Genarrative's UI re-skinning harness (two-stage A/B pipeline, three-layer contracts, chroma-key production boards) shows their output quality beats cutout's current prototype generation. Root causes identified (2026-07-17 session):

1. They never let the image model draw text/numerals/state labels — those are runtime overlays. We bake text into generated page images (blurry/pseudo-text is our biggest visual defect).
2. They enforce hard accept/reject gates ("violate any rule → discard and re-roll") with failure lessons fed into the next prompt. We accept first output; outcome contract only counts artifacts.
3. Their prompts are pixel-level component specs; our token injection is vibe-level.
4. Their production boards use #00FF00 chroma key; our white-background flood-fill conflicts with light-colored assets.
5. Their style master requires review before production; our design-system image goes straight into use, and DESIGN.md validation failure silently falls back.

## Goals (acceptance criteria)

- G1 **Text-discipline in page generation**: page & design-system prompts constrain text to placeholder shapes / minimal text; no dense pseudo-text baked into images. Verifiable: prompt templates contain the constraint; existing tests still pass.
- G2 **Vision QA + reject/retry loop**: after key generated images (design system, page, board), a vision review pass scores against a checklist; failures trigger bounded re-roll (max 2 retries) with failure reasons appended to the retry prompt ("lessons feedback").
- G3 **Component-grade spec injection**: page/board prompts derive per-region component size/state/negative constraints from PrototypePlan regions, not only global tokens.
- G4 **Chroma-key boards**: asset-board generation switches from white #FFFFFF to a keyable solid (#00FF00 default) with near-color negative constraints; cutout pipeline keys on that color.
- G5 **Hard style gate**: DESIGN.md validation failure surfaces as an outcome gap (repairable) instead of silent fallback; design-system stage exposes its QA verdict in run events.

## Non-goals

- No HTML/DOM assembly of final pages (separate future task).
- No change to vectorize, save, BYOK, or agent-dock UX.
- No new external services; QA pass uses the existing configured vision-capable model path.

## Constraints

- Must not break existing repair loop (prototype-outcome / prototype-repair).
- Retries are paid calls: hard cap (2), disable-able via a single flag.
- Prompt changes stay inside src/prompts/catalog and generate-suite string builders; follow prompt registry conventions.
- Type-check with `tsc --noEmit -p tsconfig.app.json` (repo gotcha: `-p .` is a no-op).

## Scope split (ordered)

1. G1 + G3 (prompt-layer, no new calls) — highest leverage, cheapest.
2. G4 chroma-key board + keying change in slice pipeline.
3. G2 vision QA gate + lesson feedback.
4. G5 hard gate wiring into outcome/repair + run events.
