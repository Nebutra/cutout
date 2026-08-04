# Real-model end-to-end benchmark run — 2026-08-05

First execution of the `CUTOUT_RUN_*` gated suites. These cost real money and
minutes, so CI has never run them; this is the first time they have been
exercised since they were written.

Branch `release/v0.1.19-rc`, base `6f02c5a` (v0.1.18).
Gateway: `aigw.mox.ktvsky.com`, chat model `gpt-5.5`.

---

## Headline

**The gated suites had bit-rotted while gated off.** Five of seven could not
reach a model at all — they failed in seconds on harness defects, not on model
quality. Because nothing ran them, nothing reported the decay.

After repairing the harnesses (product code untouched), the real-model picture
is: **image generation, region naming, tool-gate classification and the
human-in-the-loop path all work against a real model.** The one blocked path is
blocked by gateway infrastructure returning HTTP 502, not by Cutout.

## Results

| Suite | Before repair | After repair | Wall clock |
|---|---|---|---|
| `services/ai/gateway-images.integration.test.ts` | ✅ 2/2 | — | 40.7s + 43.9s |
| `prototype/region-naming.integration.test.ts` | ❌ harness | ✅ 1/1 | 64.5s |
| `components/workspace/human-loop-ask.e2e.test.tsx` | ❌ harness | ✅ 1/1 | 9.0s |
| `agent-runtime/tool-gate-classification.integration.test.ts` | ⚠️ 6/7 | — | 57.5s |
| `prototype/prototype-planner.integration.test.ts` | ❌ harness | ❌ gateway 502 | 90s timeout |
| `components/workspace/prototype-pipeline.e2e.test.tsx` | ❌ harness | see below | — |
| `visual-generation/brand-benchmark.integration.test.ts` | see below | | |

### What genuinely works

- **Real image bytes.** `generateImages` and `editImage` (垫图) both return real
  PNG bytes from the gateway. This is the single most load-bearing capability in
  the product and it is proven.
- **Region-primed slice naming.** Produced correct structured names with intact
  manifest lineage: `hero-submit-button`, `hero-search-icon`, `hero-user-avatar`.
- **Human-in-the-loop.** A real clarifying question renders in the real
  `IntentWorkspace`, keeps the composer enabled, and resolves on answer.
- **Tool-gate classification, 6 of 7.** Greeting → `reply_conversationally`;
  Astryx request → `compile_astryx_theme`; regeneration-strategy request →
  `configure_prototype_regeneration`; page-named request →
  `select_pages_to_regenerate` with correct page ids; rambling request →
  `proceed_with_generation` with a distilled brief; ambiguous request →
  `ask_clarifying_question` and answering resumes the same turn.

### Finding 1 — harness rot (repaired)

Two defects, each fatal before any network call:

1. `gateway-generation.testkit.ts:53-62` and the inline configs in
   `prototype-pipeline.e2e.test.tsx:137` / `human-loop-ask.e2e.test.tsx:186`
   built a `ProviderConfig` with `kind: 'openai'` and **no `wireProtocol`**.
   `effectiveProviderWireProtocol` (`services/ai/provider-types.ts:76`) throws
   for every non-gateway kind without it. Every `generateObject`-based benchmark
   threw before issuing a request. The image benchmarks were unaffected because
   they never call `prepare`.
2. `prototype-pipeline.e2e.test.tsx` and `human-loop-ask.e2e.test.tsx` mocked
   `@/services/ai/model-assignment.local` without `loadCapabilityBindings` /
   `setCapabilityBinding` / `clearCapabilityBinding`, so `useCapabilityBindings`
   (`hooks/queries/ai-settings.ts:35`) threw during the first render of
   `IntentWorkspace` (`IntentWorkspace.tsx:907`).

Both are pre-existing — `git log release/v0.1.19-rc ^6f02c5a` shows this branch
never touched `provider-types.ts`, `generation-service.local.ts`,
`model-assignment.local.ts` or `ai-settings.ts`. Fixed in `8eab726` and `b3a1ccf`.

**The real lesson is not the two defects.** It is that a suite whose header calls
itself "the definitive proof" can rot to non-functional and stay that way,
because the gate that protects the budget also removes all feedback.

### Finding 2 — tool-gate over-triggers on terse briefs

`tool-gate-classification.integration.test.ts:159` expects a terse build brief to
call **no** tool and fall through to the pipeline. The model called one
(`called` was `true`, expected `false`).

Not repaired — this is a model-behaviour finding, and patching the assertion
would destroy the signal. Worth re-running to establish whether it is
deterministic or sampling noise before deciding whether the gate prompt needs
tightening.

### Finding 3 — brand benchmark rejected at the refine step

`brand-benchmark.integration.test.ts` reaches real execution and runs for 73s.
Generation succeeds; the **refine/edit** step is rejected:

```
BenchmarkProviderError: Image provider rejected the bounded benchmark request.
Serialized Error: { code: 'provider-image-edit-rejected', status: 400 }
  ❯ imageResponse  brand-benchmark.integration.test.ts:536
  ❯ refineOrRegenerate  visual-generation/executor.ts:322
```

Notably `gateway-images.integration.test.ts` **passes** `editImage (垫图)` in the
same window, so image editing as a capability is not broken.

The difference is the request the benchmark builds at
`brand-benchmark.integration.test.ts:509-519`: it hardcodes `model: "gpt-image-2"`
and `input_fidelity: "high"`, while the passing test uses `gpt-image-1`
(`gateway-generation.testkit.ts:40`).

**Root cause not isolated.** The obvious hypothesis — that the relay does not
serve `gpt-image-2` — was checked and is **false**: `GET /v1/models` lists
`gpt-image-1`, `gpt-image-1.5` and `gpt-image-2`. So the 400 is about the request
shape, most likely `input_fidelity` or `/images/edits` support for that specific
model. Deliberately not "fixed" by switching the model, because changing the
model changes what the benchmark measures.

The two adapter-level unit tests in the same file pass, including the one
asserting that an edit rejection becomes a structured, secret-free provider
error — which is exactly what happened here. The error path behaved correctly.

### Finding 4 — gateway 502 blocks the planner

`prototype-planner.integration.test.ts` now reaches the network and fails there:

```
RetryError [AI_RetryError]: Failed after 3 attempts. Last error: Upstream request failed
  url: 'https://aigw.mox.ktvsky.com/v1/responses'
  statusCode: 502
  responseBody: '{"error":{"message":"Upstream request failed","type":"upstream_error"}}'
```

Three attempts, all 502. Note the endpoint is `/v1/responses` (the OpenAI
Responses API), whereas `region-naming` succeeded over a different path in the
same window — so this is endpoint-specific, not a blanket outage.

This is **infrastructure, not product code**. Cutout's own behaviour on the
failure is correct: bounded retries, then a structured error rather than a hang.

Note also that `--testTimeout` on the CLI cannot extend this test — it declares
`{ timeout: 90_000 }` inline at `prototype-planner.integration.test.ts:38`, which
takes precedence.

## Reproduce

```bash
CUTOUT_RUN_PIPELINE_BENCHMARK=1   npx vitest run src/services/ai/gateway-images.integration.test.ts
CUTOUT_RUN_PIPELINE_BENCHMARK=1   npx vitest run src/prototype/region-naming.integration.test.ts
CUTOUT_RUN_PIPELINE_BENCHMARK=1   npx vitest run src/prototype/prototype-planner.integration.test.ts
CUTOUT_RUN_PIPELINE_BENCHMARK=1   npx vitest run src/components/workspace/prototype-pipeline.e2e.test.tsx
CUTOUT_RUN_TOOL_GATE_BENCHMARK=1  npx vitest run src/agent-runtime/tool-gate-classification.integration.test.ts
CUTOUT_RUN_TOOL_GATE_BENCHMARK=1  npx vitest run src/components/workspace/human-loop-ask.e2e.test.tsx
CUTOUT_RUN_BRAND_BENCHMARK=1      npx vitest run src/visual-generation/brand-benchmark.integration.test.ts
```

Requires `MOX_API_KEY` and `MOX_BASE_URL`.

## Recommendation

Add a scheduled (not per-PR) workflow that runs these against the gateway on a
protected environment. The cost argument for gating them per-PR is sound; the
cost of never running them is two silent harness breaks and an unmeasured
product claim. A nightly or weekly cadence buys the feedback without the
per-commit spend.
